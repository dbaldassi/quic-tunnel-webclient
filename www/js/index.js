
// Request ids
const START_REQUEST = 0;
const STOP_REQUEST = 1;
const LINK_REQUEST = 2;
const OUT_REQUEST = 3;
const START_SERVER_REQUEST = 4;
const STOP_SERVER_REQUEST = 5;

// time
const SEC = 1000;
const MIN = 60 * SEC;

// TURN
const TURN_USERNAME = "test";
const TURN_PASSWORD = "test123";
const TURN_PORT     = 3478;
const TURN_ADDR     = "turn.dabaldassi.fr";

let sessionId = 0;

let playing = true;
let local_pc = null;
let remote_pc = null;

function getLocalVideo() {
    return document.getElementById('local');
}

function getRemoteVideo() {
    return document.getElementById('remote');
}

async function createLocalPeerConnection(port) {
    const config = {
	'iceServers': [{
	    urls:'turn:' + TURN_ADDR + ':' + port,
	    username: TURN_USERNAME,
	    credential: TURN_PASSWORD
	}
		      ],
	iceTransportPolicy: "relay"
    };
    
    local_pc = new RTCPeerConnection(config);
    
    let local = getLocalVideo();
    const stream = local.captureStream();
    local.streamObject = stream;

    local_pc.addEventListener('connectionstatechange', event => {
	console.log("local pc : " + local_pc.connectionState);
    });
    
    stream.getVideoTracks().forEach(t => local_pc.addTrack(t, stream));

    const offer = await local_pc.createOffer([{ offerToReceiveVideo: false, offerToReceiveAudio: false }]);
    await local_pc.setLocalDescription(offer);

    console.log({ offer: offer.sdp });
    
    return offer;
}

async function createRemotePeerConnection(offer) {
    const configuration = {
	'iceServers': [{
	    urls:'turn:' + TURN_ADDR + ':' + TURN_PORT,
	    username: TURN_USERNAME,
	    credential: TURN_PASSWORD
	}
		      ]
    };

    console.log(configuration);
    
    remote_pc = new RTCPeerConnection(configuration);
    
    remote_pc.addEventListener('track', async function(e) {
	console.log("on track");
	const [remoteStream] = e.streams;
	let remote = getRemoteVideo();
	remote.autoplay = true;
	remote.srcObject = remoteStream;
	remote.play();

	let remotetrack = remoteStream.getVideoTracks()[0];

	let count = 0;
	
	let interval = setInterval(async function() {
	    get_remote_stats(remote_pc, remotetrack, count);

	    let local = getLocalVideo();
	    let localtrack = local.streamObject.getVideoTracks()[0];
	    get_local_stats(local_pc, localtrack, count);
	    
	    count++;
	}, 1000);

	remotetrack.addEventListener("ended", (event) =>{
	    console.debug("onended", event);
	    clearInterval(interval);
	});
    });

    remote_pc.addEventListener('connectionstatechange', event => {
	console.log("remote pc : " + remote_pc.connectionState);	
    });

    await remote_pc.setRemoteDescription(new RTCSessionDescription(offer));    
    const answer = await remote_pc.createAnswer();
    console.log({answer:answer.sdp});

    await remote_pc.setLocalDescription(answer);
    
    return answer;
}

async function start_peerconnection(port) {
    console.log("co-turn with port: " + port);

    let local = getLocalVideo();
    local.play();
    
    let offer  = await createLocalPeerConnection(port);
    let answer = await createRemotePeerConnection(offer);
    await local_pc.setRemoteDescription(answer);

    local_pc.addEventListener('icecandidate', event => {
	if (event.candidate) {
	    // console.log("addRemote", event.candidate);
            remote_pc.addIceCandidate(event.candidate);
	}
    });

    remote_pc.addEventListener('icecandidate', event => {
	if (event.candidate) {
	    // console.log("add local", event.candidate);
            local_pc.addIceCandidate(event.candidate);
	}
    });
}

function stop_peerconnection() {
    let local = getLocalVideo();
    const stream = local.streamObject;

    if(stream) {
	let tracks = stream.getTracks();
	tracks.forEach(t => t.stop());
    }
    
    if(local_pc) {
	local_pc.getSenders().forEach(s => local_pc.removeTrack(s));
	local_pc.close();
	local_pc = null;
    }

    if(remote_pc) {
	remote_pc.close();
	remote_pc = null;
    }

    local.pause();
}

function start_peerconnection_medooze(port) {
    let ws = new WebSocket("wss://localhost:8084", "quic-relay-loopback");

    ws.onopen = async () => {
	local_pc = new RTCPeerConnection();
	local_pc.addEventListener('connectionstatechange', event => {
	    console.log("local pc : " + local_pc.connectionState);
	});

	local_pc.addEventListener('icecandidate', event => {
	    if (event.candidate) {
		console.log("icecandidate: ", event.candidate);
	    }
	});

	local_pc.ontrack = (e) => {
	    console.log("on medooze tracks");
	    const remoteStream = e.streams[0];
	    let remote = getRemoteVideo();

	    remote.streamId = remoteStream.id;
	    remote.srcObject = remoteStream;
	    remote.autoplay = true;
	    remote.playsInline = true;

	    let remotetrack = remoteStream.getVideoTracks()[0];

	    let count = 0;
	    	    
	    let interval = setInterval(async function() {
		get_remote_stats(local_pc, remotetrack, count);
		count++;
	    }, 1000);

	    remotetrack.addEventListener("ended", (event) =>{
		console.debug("onended", event);
		clearInterval(interval);
	    });
	};

	local_pc.addTransceiver("video", { direction: "recvonly" });
	
	const offer = await local_pc.createOffer();
	await local_pc.setLocalDescription(offer);

	console.log(offer.sdp);
	
	ws.send(JSON.stringify({ cmd: "view", offer: offer.sdp }));
    };
	
    ws.onclose = async () => {
	local_pc.close();
    };

    ws.onmessage = async (msg) => {
	let ans = JSON.parse(msg.data);
	if(ans.answer) {
	    console.log(ans.answer);
	    local_pc.setRemoteDescription(new RTCSessionDescription({
		type:'answer',
		sdp: ans.answer
	    }));
	}
    };
}

function reset_link(ws) {
    let linkObject = {
	cmd: "link",
	transId: LINK_REQUEST,
	data: {}
    };
    
    ws.send(JSON.stringify(linkObject));

    let bitrate = document.getElementById('bitrate');
    let delay = document.getElementById('delay');

    bitrate.value = "";
    delay.value = "";
}

let medooze = false;

function send_start_client(ws) {
    let cc_radio = document.getElementsByName("cc");
    let cc;

    cc_radio.forEach(function(e) {
	if(e.checked) cc = e.value;
    });
    
    let dgram_radio = document.getElementsByName("datagrams");
    let dgram;
    dgram_radio.forEach(e => dgram = e.checked && e.value === "datagram");

    let request = {
	cmd: "startclient",
	transId: START_REQUEST,
	data: {
	    datagrams: dgram,
	    cc: cc,
	    quic_port: 8888,
	    quic_host: "192.168.1.47"
	}
    };

    ws.send(JSON.stringify(request));
}

function send_start_server(ws) {
    let dgram_radio = document.getElementsByName("datagrams");
    let dgram;
    dgram_radio.forEach(e => dgram = e.checked && e.value === "datagram");

    let cc_radio = document.getElementsByName("cc");
    let cc;

    cc_radio.forEach(function(e) {
	if(e.checked) cc = e.value;
    });

    let server_request = {
	cmd: "startserver",
	transId: START_SERVER_REQUEST,
	data: {
	    datagrams: dgram,
	    port_out: 10096,
	    addr_out: "192.168.1.33",
	    quic_port: 8888,
	    quic_host: "192.168.1.47",
	    cc: cc
	}
    };

    ws.send(JSON.stringify(server_request));
}

function start(in_ws, out_ws) {
    let callButton = document.querySelector('button');
    callButton.innerHTML = "Stop";

    let relay_radio = document.getElementsByName("relay");
    relay_radio.forEach(e => medooze = e.checked && e.value === "medooze");

    if(medooze) send_start_server(out_ws);
    else send_start_client(in_ws);

    // start_peerconnection_medooze(3479);
    // start_peerconnection(3479);
}

function stop(ws) {
    let callButton = document.querySelector('button');
    
    callButton.innerHTML = "Start";
    stop_peerconnection();
    let request = {
        cmd: "stopclient",
        transId: 1,
        data: {
            id: sessionId
        }
    };
    
    ws.send(JSON.stringify(request));

    display_chart();
}

function setup_ws(ws) {
    ws.onopen = () => {	console.log("in websocket is opened"); };
    ws.onerror = () => { console.log("error with websocket"); };
    ws.onmessage = msg => {
	let response = JSON.parse(msg.data);
	console.log(response);

	if(response.type === "error") {
	    console.error("Error from server :" + response.data.message);
	}
	else if(response.type === "response") {
	    if(response.transId === START_REQUEST) {
		sessionId = response.data.id;

		if(medooze) start_peerconnection_medooze(response.data.port);
		else {
		    start_peerconnection(response.data.port);
		    set_link_interval(ws, 0);
		}		
	    }
	    else if(response.transId === STOP_REQUEST) {
		window.open(response.data.url, '_blank').focus();
	    }
	    else if(response.transId === START_SERVER_REQUEST) {
		if(medooze) {
		    send_start_client(ws.in_ws);
		    set_link_interval(ws, 0);		   
		}
	    }
	}
    };
}

(function() {
    // let ws = new WebSocket("ws://dabaldassi.fr:3333");
    // let ws = new WebSocket("ws://localhost:3333");

    let in_ws = new WebSocket("ws://localhost:3333");
    let out_ws = new WebSocket("ws://lin-kanda.local:3334");
    // let out_ws = new WebSocket("ws://localhost:3334");

    out_ws.in_ws = in_ws;
    
    setup_ws(in_ws);
    setup_ws(out_ws);
    
    let callButton = document.querySelector('button');
    let linkButton = document.getElementById('link');
    let resetLinkButton = document.getElementById('resetlink');
    
    callButton.onclick = function(e) {
	console.log("click");
	if(callButton.innerHTML === "Start") start(in_ws, out_ws);
	else stop(in_ws, out_ws);
    };

    linkButton.onclick = function(_) {
	let bitrate = document.getElementById('bitrate');
	let delay = document.getElementById('delay');
	
	let linkObject = {
	    cmd: "link",
	    transId: LINK_REQUEST,
	    data: {
		bitrate: parseInt(bitrate.value, 10),
		delay: parseInt(delay.value, 10)
	    }
	};

	if(medooze) out_ws.send(JSON.stringify(linkObject));
	else in_ws.send(JSON.stringify(linkObject));
    };
    
    resetLinkButton.onclick = (_) => {
	if(medooze) reset_link(out_ws);
	else reset_link(in_ws);
    };
})();

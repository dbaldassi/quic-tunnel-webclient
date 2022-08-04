
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

let clientSessionId = 0;
let serverSessionId = 0;

let playing = true;
let local_pc = null;

let medooze_ws = null;
let medooze_csv_url = null;
const medooze_url = "localhost:8084";

function getRemoteVideo() {
    return document.getElementById('remote');
}

function stop_peerconnection() {    
    if(local_pc) {
	local_pc.close();
	local_pc = null;
    }
}

function start_peerconnection_medooze() {
    medooze_ws = new WebSocket("wss://" + medooze_url, "quic-relay-loopback");

    medooze_ws.onopen = async () => {
	local_pc = new RTCPeerConnection();
	local_pc.addEventListener('connectionstatechange', event => {
	    console.log("local pc : " + local_pc.connectionState);
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
	
	medooze_ws.send(JSON.stringify({ cmd: "view", offer: offer.sdp }));
    };
	
    medooze_ws.onclose = async () => {
	console.log("medooze websocket closed");
	stop_peerconnection();
    };

    medooze_ws.onmessage = async (msg) => {
	let ans = JSON.parse(msg.data);
	if(ans.answer) {
	    local_pc.setRemoteDescription(new RTCSessionDescription({
		type:'answer',
		sdp: ans.answer
	    }));
	}
	if(ans.url) {
	    medooze_csv_url = "https://" + medooze_url + ans.url;
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

function send_start_server(ws, medooze_port) {
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
	    port_out: medooze_port,
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

    let ws = new WebSocket("wss://" + medooze_url, "port");
    ws.onmessage = msg => {
	let response = JSON.parse(msg.data);
	send_start_server(out_ws, response.port);
	ws.close();
    };
    ws.onclose = () => console.log("medooze websocket/port closed");    
}

function stop(in_ws, out_ws) {
    console.log("stoppping");
    let callButton = document.querySelector('button');
    
    callButton.innerHTML = "Start";

    if(medooze_ws) {
	medooze_ws.close();
	medooze_ws = null;
    }
    if(medooze_csv_url) {
	const bweUrl = "https://medooze.github.io/bwe-stats-viewer/?url=" + encodeURIComponent(medooze_csv_url);
	window.open(bweUrl, '_blank').focus();
	medooze_csv_url = null;
    }
    
    stop_peerconnection();
    let request = {
        cmd: "stopclient",
        transId: STOP_REQUEST,
        data: {
            id: clientSessionId
        }
    };
    
    in_ws.send(JSON.stringify(request));
    
    request.cmd = 'stopserver';
    request.transId = STOP_SERVER_REQUEST;
    request.data.id = serverSessionId;

    out_ws.send(JSON.stringify(request));
    
    // display_chart();
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
		clientSessionId = response.data.id;
		start_peerconnection_medooze(response.data.port);
	    }
	    else if(response.transId === STOP_REQUEST) {
		// opening qvis visualiztion for client side
		// window.open(response.data.url, '_blank').focus();
	    }
	    else if(response.transId === START_SERVER_REQUEST) {
		serverSessionId = response.data.id;
		send_start_client(ws.in_ws);
		set_link_interval(ws, 0, () => {
		    console.log("finito!");
		    reset_link(ws);
		    stop(ws.in_ws, ws);
		});
	    }
	    else if(response.transId === STOP_SERVER_REQUEST) {
		// opening qvis visualization for server side
		window.open(response.data.url, '_blank').focus();
	    }
	}
    };
}

(function() {
    // let ws = new WebSocket("ws://dabaldassi.fr:3333");
    // let ws = new WebSocket("ws://localhost:3333");

    let in_ws = new WebSocket("ws://localhost:3333");
    let out_ws = new WebSocket("ws://lin-kanda.local:3334");

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

	out_ws.send(JSON.stringify(linkObject));
    };
    
    resetLinkButton.onclick = (_) => reset_link(out_ws);
})();

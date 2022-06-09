
function getLocalVideo() {
    return document.getElementById('local');
}

function getRemoteVideo() {
    return document.getElementById('remote');
}

var opts = {
    lines: 12, // The number of lines to draw
    angle: 0.15, // The length of each line
    lineWidth: 0.44, // 0.44 The line thickness
    pointer: {
	length: 0.8, // 0.9 The radius of the inner circle
	strokeWidth: 0.035, // The rotation offset
	color: '#A0A0A0'     // Fill color
    },
    limitMax: true,
    colorStart: '#28c1d1', // Colors
    colorStop: '#28c1d1', // just experiment with them
    strokeColor: '#F0F0F0', // to see which ones work best for you
    generateGradient: false,
    gradientType: 0
};

var targets = document.querySelectorAll('.gaugeChart'); // your canvas element
var gauges = [];
for (var i=0;i<targets.length;++i)
{
	gauges[i] = new Gauge(targets[i]).setOptions(opts); // create sexy gauge!
	gauges[i].animationSpeed = 10000; // set animation speed (32 is default value)
	gauges[i].set(0); // set actual value
}

gauges[0].maxValue = 1280; 
gauges[1].maxValue = 720; 
gauges[2].maxValue = 30; 
gauges[3].maxValue = 1024; 

var texts =  document.querySelectorAll('.gaugeChartLabel');

async function getMedia() {
    let stream = null;

    try {
	stream = await navigator.mediaDevices.getUserMedia({
	    audio : true,
	    video : { width: 640, height: 480 }
	});	
    } catch(err) {
	console.err(err);
    }

    return stream;
}

async function createLocalPeerConnection(configuration) {
    const pc = new RTCPeerConnection(configuration);
    let local = getLocalVideo();
    const stream = local.captureStream();
    local.streamObject = stream;
    console.log(local);

    pc.addEventListener('connectionstatechange', event => {
	console.log("local pc : " + pc.connectionState);
    });
    
    stream.getVideoTracks().forEach(t => pc.addTrack(t, stream));

    const offer = await pc.createOffer([{ offerToReceiveVideo: true, offerToReceiveAudio: false }]);
    await pc.setLocalDescription(offer);

    console.log({offer: offer.sdp});
    
    return { pc, offer };
}

let playing = true;
let local_pc = null;
let remote_pc = null;

async function createRemotePeerConnection(configuration, offer) {
    const pc = new RTCPeerConnection(configuration);
    
    pc.addEventListener('track', async function(e) {
	var prev = 0,prevFrames = 0,prevBytes = 0;
	console.log("on track");
	const [remoteStream] = e.streams;
	let remote = getRemoteVideo();
	remote.autoplay = true;
	remote.srcObject = remoteStream;
	remote.play();

	let track = remoteStream.getVideoTracks()[0];
	let interval = setInterval(async function(){
	    var results;

	    try {
		//For ff
		results = await remote_pc.pc.getStats(track);
	    } catch(e) {
		//For chrome
		results = await remote_pc.pc.getStats();
	    }
	    //Get results
	    for (let result of results.values())
	    {
		if (result.type==="inbound-rtp")
		{
		    //Get timestamp delta
		    var delta = result.timestamp-prev;
		    //Store this ts
		    prev = result.timestamp;

		    //Get values
		    var width = track.width || remote.videoWidth;//result.stat("googFrameWidthReceived");
		    var height = track.height || remote.videoHeight;//result.stat("googFrameHeightReceived");
		    var fps =  (result.framesDecoded-prevFrames)*1000/delta;
		    var kbps = (result.bytesReceived-prevBytes)*8/delta;
		    //Store last values
		    prevFrames = result.framesDecoded;
		    prevBytes  = result.bytesReceived;
		    //If first
		    if (delta==result.timestamp || isNaN(fps) || isNaN (kbps))
			return;

		    for (var i=0;i<targets.length;++i)
			gauges[i].animationSpeed = 10000000; // set animation speed (32 is default value)
		    gauges[0].set(width);
		    gauges[1].set(height);
		    gauges[2].set(Math.min(Math.floor(fps)   ,30));
		    gauges[3].set(Math.min(Math.floor(kbps) ,1024));
		    texts[0].innerText = width;
		    texts[1].innerText = height;
		    texts[2].innerText = Math.floor(fps);
		    texts[3].innerText =  Math.floor(kbps);
		}
	    }
	}, 1000);

	track.addEventListener("ended", (event) =>{
		console.debug("onended", event);
		clearInterval(interval);
	});
    });

    pc.addEventListener('connectionstatechange', event => {
	console.log("remote pc : " + pc.connectionState);
    });

    await pc.setRemoteDescription(new RTCSessionDescription(offer));    
    const answer = await pc.createAnswer();
    console.log({answer:answer.sdp});

    await pc.setLocalDescription(answer);
    
    return { pc, answer };
}

async function start_peerconnection(port) {
    let local = getLocalVideo();
    local.play();

    let remote = getRemoteVideo();

    const relayConfiguration = {
	'iceServers': [
	    {
		urls:'turn:turn.dabaldassi.fr:' + port,
		username: 'test',
		credential: 'test123'
	    }
	],
	iceTransportPolicy: "relay"
    };

    const configuration = {
	'iceServers': [
	    {
		urls:'turn:turn.dabaldassi.fr:3478',
		username: 'test',
		credential: 'test123'
	    }
	]
    };
    
    local_pc  = await createLocalPeerConnection(relayConfiguration);
    remote_pc = await createRemotePeerConnection(configuration, local_pc.offer);
    await local_pc.pc.setRemoteDescription(remote_pc.answer);

    local_pc.pc.addEventListener('icecandidate', event => {
	if (event.candidate) {
	    console.log("addRemote", event.candidate);
            remote_pc.pc.addIceCandidate(event.candidate);
	}
    });

    remote_pc.pc.addEventListener('icecandidate', event => {
	if (event.candidate) {
	    console.log("add local", event.candidate);
            local_pc.pc.addIceCandidate(event.candidate);
	}
    });    
}

function stop_peerconnection() {
    let local = getLocalVideo();
    const stream = local.streamObject;
    const tracks = stream.getTracks();

    local_pc.pc.getSenders().forEach(s => local_pc.pc.removeTrack(s));
    tracks.forEach(t => t.stop());

    local.pause();

    local_pc.pc.close();
    remote_pc.pc.close();
}

(function() {
    let ws = new WebSocket("ws://dabaldassi.fr:3333");
    // let ws = new WebSocket("ws://localhost:3333");
    let sessionId = 0;

    ws.onopen = () => {	console.log("websocket is opened"); };
    ws.onerror = () => { console.log("error with websocket"); };
    ws.onmessage = msg => {
	let response = JSON.parse(msg.data);
	console.log(response);

	if(response.type === "error") {
	    console.error("Error from server :" + response.data.message);
	}
	else if(response.type === "response") {
	    if(response.transId === 0) {
		sessionId = response.data.id;
		start_peerconnection(response.data.port);
	    }
	    else {
		window.open(response.data.url, '_blank').focus();
	    }
	}
    };
    
    let callButton = document.querySelector('button');
    let linkButton = document.getElementById('link');
    let resetLinkButton = document.getElementById('resetlink');
    
    callButton.onclick = function(e) {
	console.log("click");
	console.log(callButton.innerHTML);
	if(callButton.innerHTML === "Start") {
	    callButton.innerHTML = "Stop";

	    let cc_radio = document.getElementsByName("cc");
	    let cc;

	    cc_radio.forEach(function(e) {
		if(e.checked) cc = e.value;
	    });

	    let dgram_radio = document.getElementsByName("datagrams");
	    let dgram;
	    
	    dgram_radio.forEach(function(e) {
		if(e.checked) dgram = e;
	    });
	    
	    let request = {
		cmd: "startclient",
		transId: 0,
		data: {
		    datagrams: dgram.value === "datagram",
		    cc: cc
		}
	    };

	    console.log(request);
	    
	    ws.send(JSON.stringify(request));
	} else {
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
	}
    };

    linkButton.onclick = function(_) {
	let bitrate = document.getElementById('bitrate');
	let delay = document.getElementById('delay');
	
	let linkObject = {
	    cmd: "link",
	    transId: 2,
	    data: {
		bitrate: parseInt(bitrate.value, 10),
		delay: parseInt(delay.value, 10)
	    }
	};

	ws.send(JSON.stringify(linkObject));
    };
    
    resetLinkButton.onclick = function(_) {
	let linkObject = {
	    cmd: "link",
	    transId: 2,
	    data: {}
	};
	
	ws.send(JSON.stringify(linkObject));

	let bitrate = document.getElementById('bitrate');
	let delay = document.getElementById('delay');

	bitrate.value = "";
	delay.value = "";
    };
})();

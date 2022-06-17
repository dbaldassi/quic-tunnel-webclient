
// Request ids
const START_REQUEST = 0;
const STOP_REQUEST = 1;
const LINK_REQUEST = 2;
const OUT_REQUEST = 3;

// time
const SEC = 1000;
const MIN = 60 * SEC;

// LINK
const LINK_LIMIT = [[60, 1000, 1], [30, 500, 1], [30, 1000, 1]]; // [time to wait, link cap, delay]

let stats = [];
let stats_send = [];
let link_chart = [];
let current_link = 0;

let sessionId = 0;

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
for (var i=0; i < targets.length; ++i)
{
	gauges[i] = new Gauge(targets[i]).setOptions(opts); // create sexy gauge!
	gauges[i].animationSpeed = 10000; // set animation speed (32 is default value)
	gauges[i].set(0); // set actual value
}

gauges[0].maxValue = 1280; 
gauges[1].maxValue = 720; 
gauges[2].maxValue = 30; 
gauges[3].maxValue = 1024; 
gauges[4].maxValue = 1024; 

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

    console.log({ offer: offer.sdp });
    
    return { pc, offer };
}

let playing = true;
let local_pc = null;
let remote_pc = null;

var prev = 0, prevFrames = 0, prevBytes = 0;
var prev1 = 0, prevFrames1 = 0, prevBytes1 = 0;

async function get_remote_stats(track, count) {
    var results;
    let remote = getRemoteVideo();

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

	    stats.push({x: count, y: Math.floor(kbps)});
	    link_chart.push({x: count, y: LINK_LIMIT[current_link][1]});
	    ++count;
	}
    }
}

async function get_local_stats(track, count) {
    var results;
    let local = getLocalVideo();

    try {
	//For ff
	results = await local_pc.pc.getStats(track);
    } catch(e) {
	//For chrome
	results = await local_pc.pc.getStats();
    }
    //Get results
    for (let result of results.values())
    {
	if (result.type === "outbound-rtp")
	{
	    //Get timestamp delta
	    var delta = result.timestamp - prev1;
	    //Store this ts
	    prev1 = result.timestamp;
	    
	    var kbps = (result.bytesSent - prevBytes1) * 8 / delta;
	    //Store last values
	    prevBytes1 = result.bytesSent;
	    //If first	    
	    if (delta == result.timestamp || isNaN(kbps)) return;

	    gauges[4].set(Math.min(Math.floor(kbps) ,1024));
	    texts[4].innerText =  Math.floor(kbps);

	    stats_send.push({x: count, y: Math.floor(kbps)});
	}
    }
}

async function createRemotePeerConnection(configuration, offer) {
    const pc = new RTCPeerConnection(configuration);
    
    pc.addEventListener('track', async function(e) {
	console.log("on track");
	const [remoteStream] = e.streams;
	let remote = getRemoteVideo();
	remote.autoplay = true;
	remote.srcObject = remoteStream;
	remote.play();

	let remotetrack = remoteStream.getVideoTracks()[0];

	let count = 0;
	
	let interval = setInterval(async function() {
	    get_remote_stats(remotetrack, count);

	    let local = getLocalVideo();
	    let localtrack = local.streamObject.getVideoTracks()[0];
	    get_local_stats(localtrack, count);
	    
	    count++;
	}, 1000);

	remotetrack.addEventListener("ended", (event) =>{
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

function start_peerconnection_medooze(port) {
    let ws = new WebSocket("wss://localhost:8084", "quic-relay");
    let local = getLocalVideo();
    local.play();

    ws.onopen = async () => {
	local_pc = new RTCPeerConnection();
	const stream = local.captureStream();
	local.streamObject = stream;

	local_pc.addEventListener('connectionstatechange', event => {
	    console.log("local pc : " + local_pc.connectionState);
	});
    
	stream.getVideoTracks().forEach(t => local_pc.addTrack(t, stream));

	const offer = await local_pc.createOffer();
	await local_pc.setLocalDescription(offer);

	ws.send(JSON.stringify({ cmd: "publish", offer: offer.sdp }));
    };
    
    ws.onclose = async () => {
	local_pc.close();
    };

    ws.onmessage = async (msg) => {
	console.log(msg);
	let ans = JSON.parse(msg.data);
	if(ans.answer) {
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

function set_link_interval(ws, current) {
    if(current >= LINK_LIMIT.length) {
	reset_link(ws);
	stop(ws);
    } else {
	current_link = current;
	let link = LINK_LIMIT[current];
	let time = link[0];
	let bitrate = link[1];
	let delay = link[2];
	
	let linkObject = {
	    cmd: "link",
	    transId: LINK_REQUEST,
	    data: {
		bitrate: bitrate,
		delay: delay
	    }
	};

	ws.send(JSON.stringify(linkObject));

	setTimeout(set_link_interval, time * SEC, ws, current + 1);
    }
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

    $.get("https://canvasjs.com/services/data/datapoints.php?xstart=5&ystart=10&length=10&type=csv", function(data) {
	var chart = new CanvasJS.Chart("chartContainer", {
            title: {
		text: "Chart from CSV",
            },
            data: [{
		type: "line",
		dataPoints: stats
	    }, {
		type: 'line',
		dataPoints: link_chart
	    }, {
		type: 'line',
		dataPoints: stats_send
	    }]
	});
	
	chart.render();
    });
}
/*
$.get("https://canvasjs.com/services/data/datapoints.php?xstart=5&ystart=10&length=10&type=csv", function(data) {
	var chart = new CanvasJS.Chart("chartContainer", {
            title: {
		text: "Chart from CSV",
            },
            data: [{
		type: "line",
		dataPoints: [{x: 0, y: 1}, {x: 1, y: 1}, {x: 2, y: 1}] 
	    }, {
		type: "line",
		dataPoints: [{x: 0, y: 3}, {x: 1, y: 4}, {x: 2, y: 5}] 
	    }]
	});
	
	chart.render();
    });
*/
(function() {
    let ws = new WebSocket("ws://dabaldassi.fr:3333");
    // let ws = new WebSocket("ws://localhost:3333");
    let medooze = false;

    ws.onopen = () => {	console.log("websocket is opened"); };
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
	    dgram_radio.forEach(e => dgram = e.checked && e.value === "datagram");

	    let relay_radio = document.getElementsByName("relay");
	    relay_radio.forEach(e => medooze = e.checked && e.value === "medooze");
	    
	    let request = {
		cmd: "startclient",
		transId: START_REQUEST,
		data: {
		    datagrams: dgram,
		    cc: cc
		}
	    };

	    // console.log(request);

	    // if(medooze) start_peerconnection_medooze(9000);
	    
	    ws.send(JSON.stringify(request));
	} else stop(ws);
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

	ws.send(JSON.stringify(linkObject));
    };
    
    resetLinkButton.onclick = (_) => reset_link(ws);
})();

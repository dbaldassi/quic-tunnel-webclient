
// Request ids
const START_REQUEST = 0;
const STOP_REQUEST = 1;
const LINK_REQUEST = 2;
const OUT_REQUEST = 3;
const START_SERVER_REQUEST = 4;
const STOP_SERVER_REQUEST = 5;

// time
const SEC = 33;
const MIN = 60 * SEC;

// Quic session id, returned when starting a quic endpoint
let clientSessionId = 0;
let serverSessionId = 0;

// local peerconecction
let local_pc = null;

// websocket connection to medooze media server
let medooze_ws = null;
// medooze bwe stats viewer url to upload csv file after session
let medooze_csv_url = null;
// medooze media server port (RTP/RTCP)
const medooze_url = "localhost:8084";

function getRemoteVideo() {
    // return the HTML video element to play the received stream
    return document.getElementById('remote');
}

function stop_peerconnection() {    
    if(local_pc) {
	local_pc.close();
	local_pc = null;
    }
}

function start_peerconnection_medooze() {
    // Create websocket with medooze with sub-protocol quic-relay-loopback
    medooze_ws = new WebSocket("wss://" + medooze_url, "quic-relay-loopback");

    medooze_ws.onopen = async () => {
	// create RTC peerconnection
	local_pc = new RTCPeerConnection();
	local_pc.addEventListener('connectionstatechange', event => {
	    // print status (connected, disconnected ... )
	    console.log("local pc : " + local_pc.connectionState);
	});

	// media track received
	local_pc.ontrack = (e) => {
	    // get the remote stream coming from medooze
	    const remoteStream = e.streams[0];
	    // get html video element
	    let remote = getRemoteVideo();

	    remote.streamId = remoteStream.id;
	    // add the stream to the html vidoe
	    remote.srcObject = remoteStream;
	    remote.autoplay = true;
	    remote.playsInline = true;

	    // get the video track object
	    let remotetrack = remoteStream.getVideoTracks()[0];

	    let count = 0;

	    // get the RTC stats every 1s
	    let interval = setInterval(async function() {
		get_remote_stats(local_pc, remotetrack, count);
		count++;
	    }, 1000);

	    // listen for ended event of video track to stop gathering the RTC stats
	    remotetrack.addEventListener("ended", (event) =>{
		console.debug("onended", event);
		// stop the interval timeout
		clearInterval(interval);
	    });
	};

	// add a recvonly transceiver for the video track
	local_pc.addTransceiver("video", { direction: "recvonly" });

	// create offer
	const offer = await local_pc.createOffer();
	// set local description
	await local_pc.setLocalDescription(offer);

	// Send the SDP to medooze
	medooze_ws.send(JSON.stringify({ cmd: "view", offer: offer.sdp }));
    };

    // Stop the peerconnection if the websocket is closed
    medooze_ws.onclose = async () => {
	console.log("medooze websocket closed");
	stop_peerconnection();
    };

    medooze_ws.onmessage = async (msg) => {
	// convert raw message to JSON
	let ans = JSON.parse(msg.data);

	// If it contains an answer field
	if(ans.answer) {
	    // set remote description
	    local_pc.setRemoteDescription(new RTCSessionDescription({
		type:'answer',
		sdp: ans.answer
	    }));
	}
	if(ans.url) {
	    // URL for csv dump file. Will be open in the BWE stat viewer
	    medooze_csv_url = "https://" + medooze_url + ans.url;
	}
    };
}

// remove all tc constraints
function reset_link(ws) {
    let linkObject = {
	cmd: "link",
	transId: LINK_REQUEST,
	data: {}
    };

    // send command to tunnel
    ws.send(JSON.stringify(linkObject));

    // reset UI
    let bitrate = document.getElementById('bitrate');
    let delay = document.getElementById('delay');

    bitrate.value = "";
    delay.value = "";
}

// Send the start command for the client endpoint of the tunnel
function send_start_client(ws) {
    // Get the choosen congestion controller
    let cc_radio = document.getElementsByName("cc");
    let cc;

    cc_radio.forEach(function(e) {
	if(e.checked) cc = e.value;
    });

    // check if we will use datagrams or streams
    let dgram_radio = document.getElementsByName("datagrams");
    let dgram = false;
    dgram_radio.forEach(e => {
	if(e.checked && e.value === "datagram") dgram = true;
    });

    // Check if we start a concurent file transfer
    let file_transfer_radio = document.getElementsByName("filetransfer");
    let external = false;
    file_transfer_radio.forEach(e => {
	if(e.checked && e.value === "external") external = true;
    });

    // build the JSON request
    let request = {
	cmd: "startclient",
	transId: START_REQUEST,
	data: {
	    datagrams: dgram,
	    cc: cc,
	    quic_port: 8888,
	    // quic_host: "192.168.1.47",
	    quic_host: "192.168.1.33",
	    external_file_transfer: external
	}
    };

    console.log(request);

    // Send the request to the tunnel
    ws.send(JSON.stringify(request));
}

// Send the start command to the server
function send_start_server(ws, medooze_port) {
    //check if datagram or stream are requested
    let dgram_radio = document.getElementsByName("datagrams");
    let dgram = false;
    dgram_radio.forEach(e => {
	console.log(e.value);
	if(e.checked && e.value === "datagram") dgram = true;
    });

    // get the choosen congestion controller
    let cc_radio = document.getElementsByName("cc");
    let cc;

    cc_radio.forEach(function(e) {
	if(e.checked) cc = e.value;
    });

    // build json request
    let server_request = {
	cmd: "startserver",
	transId: START_SERVER_REQUEST,
	data: {
	    datagrams: dgram,
	    port_out: medooze_port,
	    addr_out: "192.168.1.33",
	    quic_port: 8888,
	    quic_host: "192.168.1.33",
	    // quic_host: "192.168.1.47",
	    cc: cc
	}
    };

    console.log(server_request);

    // Send the command to the quic tunnel
    ws.send(JSON.stringify(server_request));
}

function start(in_ws, out_ws) {
    // update the ui button
    let callButton = document.querySelector('button');
    callButton.innerHTML = "Stop";

    // get which port medooze is listening to for RTP
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

    // update ui button
    let callButton = document.querySelector('button');
    if(callButton.innerHTML === "Start") return; // Already stopped
    
    callButton.innerHTML = "Start";

    // if the ws is still active, close it
    if(medooze_ws) {
	medooze_ws.close();
	medooze_ws = null;
    }
    // open the bwe stats viewer website with the csv dump file
    if(medooze_csv_url) {
	const bweUrl = "https://medooze.github.io/bwe-stats-viewer/?url=" + encodeURIComponent(medooze_csv_url);
	window.open(bweUrl, '_blank').focus();
	medooze_csv_url = null;
    }

    // stop the peerconnection
    stop_peerconnection();
    
    // build the stop client request for graceful shutdown
    let request = {
        cmd: "stopclient",
        transId: STOP_REQUEST,
        data: {
            id: clientSessionId
        }
    };

    // Send the stop command to the client
    in_ws.send(JSON.stringify(request));

    // Change the request for the quic server
    request.cmd = 'stopserver';
    request.transId = STOP_SERVER_REQUEST;
    request.data.id = serverSessionId;

    // Send stop command to the quic server
    out_ws.send(JSON.stringify(request));    
}

// setup quic tunnel websocket (client and server)
function setup_ws(ws) {
    ws.onopen = () => {	console.log("in websocket is opened"); };
    ws.onerror = () => { console.log("error with websocket"); };
    ws.onmessage = msg => {
	// get json from raw message
	let response = JSON.parse(msg.data);
	console.log(response);

	// an error occured in the tunnel
	if(response.type === "error") {
	    console.error("Error from server :" + response.data.message);
	}
	else if(response.type === "response") { // Successful response from the server
	    // Response to a start client request
	    if(response.transId === START_REQUEST) {
		// keep the session id to later close the connection
		clientSessionId = response.data.id;
		// Start the peerconnection with the medooze media server
		start_peerconnection_medooze(response.data.port);
	    }
	    // response to a stop client request with the qvis url
	    else if(response.transId === STOP_REQUEST) {
		// opening qvis visualiztion for client side
		// window.open(response.data.url, '_blank').focus();
	    }
	    // response to a start server request
	    else if(response.transId === START_SERVER_REQUEST) {
		// keep the session id to later close the connection
		serverSessionId = response.data.id;
		// Start the quic tunnel client
		send_start_client(ws.in_ws);
		// Start a timeout for tc constraint
		set_link_interval(ws, 0, () => {
		    // lambda called when every link step is complete
		    console.log("finito!");
		    // remove all constraints
		    reset_link(ws);
		    // Stop the websocket connection to the tunnel
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
    // Create websocket to control the quic tunnel
    let in_ws = new WebSocket("ws://localhost:3333"); // quic client
    // let out_ws = new WebSocket("ws://lin-kanda.local:3334"); // quic server
    let out_ws = new WebSocket("ws://localhost:3334"); // quic server

    // Keep a reference of the client ws in the server ws
    out_ws.in_ws = in_ws; 

    // setup both websocket
    setup_ws(in_ws);
    setup_ws(out_ws);

    // Setup the ui
    let callButton = document.querySelector('button');
    let linkButton = document.getElementById('link');
    let resetLinkButton = document.getElementById('resetlink');

    // Start/stop the experiment when start button is clicked
    callButton.onclick = function(e) {
	console.log("click");
	if(callButton.innerHTML === "Start") start(in_ws, out_ws);
	else stop(in_ws, out_ws);
    };

    // Manually set the tc constraints
    linkButton.onclick = function(_) {
	// get values from HTML elements
	let bitrate = document.getElementById('bitrate');
	let delay = document.getElementById('delay');

	// build json request
	let linkObject = {
	    cmd: "link",
	    transId: LINK_REQUEST,
	    data: {
		bitrate: parseInt(bitrate.value, 10),
		delay: parseInt(delay.value, 10)
	    }
	};

	// Send command
	out_ws.send(JSON.stringify(linkObject));
    };

    // Button to remove all constraints on the link
    resetLinkButton.onclick = (_) => reset_link(out_ws);
})();

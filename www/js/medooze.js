
// Request ids
const START_REQUEST = 0;
const STOP_REQUEST = 1;
const LINK_REQUEST = 2;
const OUT_REQUEST = 3;
const START_SERVER_REQUEST = 4;
const STOP_SERVER_REQUEST = 5;
const CAPABILITIES_IN_REQUEST = 6;
const CAPABILITIES_OUT_REQUEST = 7;
const UPLOAD_REQUEST = 8;
const GETSTATS_REQUEST = 9;

// time
const SEC = 1000;
const MIN = 60 * SEC;
const EXP_COOKIES = 84; // 84 days

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
let medooze_addr = null;
let medooze_port = null;

let client_stopped = false;
let server_stopped = false;

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
    let url = document.getElementById('medoozeaddr').value;
    let port = document.getElementById('medoozeport').value;
    let probing = document.getElementById('medoozeprobing').value;
    let constant_probing = probing;
    let probing_enabled = document.getElementById('medoozeprobingenable').checked;
    const medooze_url = "wss://" + url + ":" + port;

    if(!probing_enabled) probing = 0;

    medooze_ws = new WebSocket(medooze_url, "quic-relay-loopback");

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
	medooze_ws.send(JSON.stringify({ cmd: "view", offer: offer.sdp, probing: probing, constant_probing: constant_probing }));
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
	    medooze_csv_url = "https://" + url + ":" + port + ans.url;
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
    // Get the implemntation
    let impl_radio = document.getElementsByName("impl");
    let impl;

    impl_radio.forEach(function(e) {
	if(e.checked) impl = e.value;
    });
    
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

    let host = document.getElementById('qhost').value;
    let port = document.getElementById('qport').value;

    // build the JSON request
    let request = {
	cmd: "startclient",
	transId: START_REQUEST,
	data: {
	    impl: impl,
	    datagrams: dgram,
	    cc: cc,
	    quic_port: Number(port),
	    quic_host: host,
	    external_file_transfer: external
	}
    };

    console.log(request);

    // Send the request to the tunnel
    ws.send(JSON.stringify(request));
}

// Send the start command to the server
function send_start_server(ws, medooze_port) {
    // Get the quic implementation
    let impl_radio = document.getElementsByName("impl");
    let impl;
    
    impl_radio.forEach(function(e) {
	if(e.checked) impl = e.value;
    });
    
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

    // Check if we start a concurent file transfer
    let file_transfer_radio = document.getElementsByName("filetransfer");
    let external = false;
    file_transfer_radio.forEach(e => {
	if(e.checked && e.value === "external") external = true;
    });

    let out_url = document.getElementById('medoozeaddr').value;
    let host = document.getElementById('qhost').value;
    let port = document.getElementById('qport').value;
    
    // build json request
    let server_request = {
	cmd: "startserver",
	transId: START_SERVER_REQUEST,
	data: {
	    impl: impl,
	    datagrams: dgram,
	    port_out: medooze_port,
	    addr_out: out_url,
	    quic_port: parseInt(port),
	    quic_host: host,
	    cc: cc,
	    external_file_transfer: external
	}
    };

    console.log(server_request);

    // Send the command to the quic tunnel
    ws.send(JSON.stringify(server_request));    
}

function start(in_ws, out_ws) {
    // update the ui button
    let callButton = document.getElementById('call');
    callButton.innerHTML = "Stop";
    
    let url = document.getElementById('medoozeaddr').value;
    let port = document.getElementById('medoozeport').value;
    let probing = document.getElementById('medoozeprobing').value;
    let probing_enabled = document.getElementById('medoozeprobingenable').checked;
    let host = document.getElementById('qhost').value;
    let qport = document.getElementById('qport').value;
    
    const medooze_url = "wss://" + url + ":" + port;

    set_cookie("qhost", host, EXP_COOKIES);
    set_cookie("qport", qport, EXP_COOKIES);
    set_cookie("medoozeaddr", url, EXP_COOKIES);
    set_cookie("medoozeport", port, EXP_COOKIES);
    set_cookie("medoozeprobing", probing, EXP_COOKIES);
    console.log(probing_enabled);
    set_cookie("medoozeprobingenable", probing_enabled, EXP_COOKIES);

    // get which port medooze is listening to for RTP
    let ws = new WebSocket(medooze_url, "port");
    ws.onmessage = msg => {
	let response = JSON.parse(msg.data);
	send_start_server(out_ws, response.port);
	ws.close();
    };
    ws.onclose = () => console.log("medooze websocket/port closed");    
}

function stop_ws(in_ws, out_ws) {
    if(in_ws) in_ws.close();
    if(out_ws) out_ws.close();
}

function update_stop_button()
{
    let callButton = document.getElementById('call');
    
    callButton.disabled = !(client_stopped && server_stopped);

    if(!callButton.disabled) {
	callButton.innerHTML = "Start";
	client_stopped = false;
	server_stopped = false;
    }
}

function stop(in_ws, out_ws) {
    console.log("stoppping");

    // update ui button
    update_stop_button();

    // remove stream
    const stream = getRemoteVideo();
    stream.srcObject = null;

    stop_peerconnection();
    // if the ws is still active, close it
    if(medooze_ws) {	
	medooze_ws.close();
    }
    
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

    // open the bwe stats viewer website with the csv dump file
    if(medooze_csv_url) {
	const bweUrl = "https://medooze.github.io/bwe-stats-viewer/?url=" + encodeURIComponent(medooze_csv_url);
	window.open(bweUrl, '_blank').focus();
	medooze_csv_url = null;
    }
}

function create_radio_container(id, legend_name) {
    let c_temp = document.getElementById(id);
    if(c_temp) document.body.removeChild(c_temp);
    
    let container = document.createElement("div");
    container.className = "container-radio";
    container.id = id;
    
    let fieldset = document.createElement("fieldset");
    let legend = document.createElement("legend");
    legend.innerHTML = legend_name;

    fieldset.appendChild(legend);
    container.appendChild(fieldset);

    return container;
}

function create_radio_div(parent, name, value) {
    let div   = document.createElement("div");
    let input = document.createElement("input");
    let label = document.createElement("label");
    
    input.id    = value;
    input.value = value;
    input.name  = name;
    input.type  = "radio";

    label.for = value;
    label.innerHTML = value;

    div.appendChild(input);
    div.appendChild(label);
    parent.appendChild(div);
}

function show_impl_capabilities(caps) {
    console.log(caps, caps.cc);
    // Display Congestion control algo
    let container_cc = create_radio_container("cc_container", "Select a Congestion controller:");
    caps.cc.forEach(e => create_radio_div(container_cc.childNodes[0], "cc", e));
    document.body.appendChild(container_cc);
    
    // Display datagram support
    let container_dgram = create_radio_container("dgram_container", "Datagrams or stream :");
    if(caps.datagrams) create_radio_div(container_dgram.childNodes[0], "datagrams", "datagram");
    if(caps.streams) create_radio_div(container_dgram.childNodes[0], "datagrams", "stream");
    document.body.appendChild(container_dgram);

    setup_radio_cookies("cc");
    setup_radio_cookies("datagrams");
}

function show_capabilities(caps) {
    // Display implementations    
    let container = create_radio_container("impl_container", "Quic implementation : ");
    caps.forEach(e => create_radio_div(container.childNodes[0], "impl", e.impl));
    document.body.appendChild(container);
    setup_radio_cookies("impl");

    let impl_radio = document.getElementsByName("impl");
    impl_radio.forEach(e => {
	e.addEventListener('change', ev => {
	    let c = caps.find(elt => elt.impl === ev.target.value);
	    show_impl_capabilities(c);
	    set_cookie("impl", ev.target.value, EXP_COOKIES);
	});

	if(e.checked) {
	    let c = caps.find(elt => elt.impl === e.value);
	    show_impl_capabilities(c);
	}
    });    
}

let qvis_url = null;

function handle_ws_message(ws, msg) {
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
	    console.log("client stopped");

	    client_stopped = true;
	    update_stop_button();
	    
	    // opening qvis visualiztion for client side
	    // window.open(response.data.url, '_blank').focus();
	}
	// response to a start server request
	else if(response.transId === START_SERVER_REQUEST) {
	    qvis_url = null;
	    // keep the session id to later close the connection
	    serverSessionId = response.data.id;
	    // Start the quic tunnel client
	    send_start_client(ws.in_ws);
	    // Start a timeout for tc constraint
	    set_link_interval(ws, 0, (stats) => {
		// lambda called when every link step is complete
		console.log("finito!");
		// remove all constraints
		reset_link(ws);
		// Stop the peer connection and the tunnel quic endpoint
		stop(ws.in_ws, ws);

		// upload stats to quic tunnel server
		const req = {
		    cmd: "uploadstats",
		    transId: UPLOAD_REQUEST,
		    data: {
			stats: stats,
		    }
		};
		console.log(req);
		
		ws.send(JSON.stringify(req));
	    });
	}
	else if(response.transId === STOP_SERVER_REQUEST) {
	    server_stopped = true;
	    update_stop_button();

	    // opening qvis visualization for server side
	    qvis_url = response.data.url;
	    window.open(qvis_url, '_blank').focus();

	    // Get the quic implementation
	    let impl_radio = document.getElementsByName("impl");
	    let impl;
	    
	    impl_radio.forEach(function(e) {
		if(e.checked) impl = e.value;
	    });
	    
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

	    let file_transfer_radio = document.getElementsByName("filetransfer");
	    let external = false;
	    file_transfer_radio.forEach(e => {
		if(e.checked && e.value === "external") external = true;
	    });

	    let name = impl + "_" + cc;

	    if(dgram) name += "_" + "dgram";
	    else name += "_" + "stream";
	    
	    if(external) name += "_" + "scp";

	    // 0% loss
	    name += "_" + "0" + "_" + new Date().toJSON();
	    
	    const req = {
		cmd: "getstats",
		transId: GETSTATS_REQUEST,
		data: {
		    exp_name: name,
		    // qvis_file: qvis_tmp[1]
		}
	    };

	    console.log(req);
	    ws.send(JSON.stringify(req));
	}
	else if(response.transId === CAPABILITIES_IN_REQUEST) {
	    show_capabilities(response.data.in_impls);
	}
	else if(response.transId === CAPABILITIES_OUT_REQUEST) {
	    // console.log(response);
	    // TODO: differentiate client and server caps in the UI
	}
	else if(response.transId === UPLOAD_REQUEST) {
	    console.log("RECEIVE UPLOAD RESPONSE");
	}
	else if(response.transId === GETSTATS_REQUEST) {
	    console.log("GETSTATS RESP");
	    console.log(response.data);
	    window.open(response.data.url, '_blank').focus();
	    window.open(response.data.tcp_url, '_blank').focus();
	}
    }
}

function query_capabilities(ws, in_req) {
    let req = {
	cmd: 'capabilities',
	transId: ((in_req) ? CAPABILITIES_IN_REQUEST : CAPABILITIES_OUT_REQUEST),
	data: {
	    out_requested: !in_req,
	    in_requested: in_req
	}
    };

    ws.send(JSON.stringify(req));
}

function create_ws(addr) {
    let ws = new WebSocket(addr);

    return new Promise((resolve, reject) => {
	ws.onopen = () => {
	    console.log("Websocket is opened");
	    resolve(ws);
	};
	ws.onerror = () => {
	    reject("error with out websocket");
	};
	ws.onmessage = msg => handle_ws_message(ws, msg);
    });
}

async function create_websocket() {
    let button = document.getElementById("connect");
    button.innerHTML = "Connecting";
    button.disabled = true;
    
    let in_addr = document.getElementById("qclient").value;
    let out_addr = document.getElementById("qserver").value;

    set_cookie("in_addr", in_addr, EXP_COOKIES);
    set_cookie("out_addr", out_addr, EXP_COOKIES);
    
    let out_ws = await create_ws(out_addr).catch(err => console.log(err));
    if(out_ws === undefined) {
	button.innerHTML = "Connect";
	button.disabled = false;
	return [];
    }
    
    let in_ws = await create_ws(in_addr).catch(err => console.log(err));
    if(in_ws === undefined) {
	out_ws.close();
	button.innerHTML = "Connect";
	button.disabled = false;
	return [];
    }

    query_capabilities(out_ws, false);
    query_capabilities(in_ws, true);
    
    out_ws.in_ws = in_ws;
    button.innerHTML = "Disconnect";
    button.disabled = false;
    
    return [ in_ws, out_ws ];
}

(function() {
    setup_cookies();
    
    let in_ws = undefined, out_ws = undefined;

    // Setup the ui
    let callButton = document.getElementById('call');
    let linkButton = document.getElementById('link');
    let connectButton   = document.getElementById('connect');
    let resetLinkButton = document.getElementById('resetlink');

    // Start/stop the experiment when start button is clicked
    callButton.onclick = function(e) {
	console.log("click");
	if(callButton.innerHTML === "Start") start(in_ws, out_ws);
	else stop(in_ws, out_ws);
    };
    connectButton.onclick = async function(e) {	
	if(connectButton.innerHTML === "Connect") [ in_ws, out_ws ] = await create_websocket();
	else {
	    stop(in_ws, out_ws);
	    stop_ws(in_ws, out_ws);
	    in_ws  = undefined;
	    out_ws = undefined;
	    connectButton.innerHTML = "Connect";
	}
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
		delay: parseInt(delay.value, 10),
		loss: 300 // 10th percent
	    }
	};

	// Send command
	out_ws.send(JSON.stringify(linkObject));
    };

    // Button to remove all constraints on the link
    resetLinkButton.onclick = (_) => reset_link(out_ws);
})();

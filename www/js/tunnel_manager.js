
// Request ids
const START_REQUEST = 0;
const STOP_REQUEST = 1;
const LINK_REQUEST = 2;
const OUT_REQUEST = 3;
const CAPABILITIES_REQUEST = 6;
const UPLOAD_REQUEST = 8;
const GETSTATS_REQUEST = 9;

class TunnelManager {

    constructor() {
	this.pc_manager = new PeerconnectionManager();
	this.pc_manager.onlocaldesc = (desc) => this.medooze_manager.view(desc);

	this.medooze_manager = new MedoozeManager();
	this.medooze_manager.onanswer = (ans) => this.pc_manager.set_remote_description(ans);
	
	this.in_ws = null;
	this.out_ws = null;

	this.cc = null;
	this.impl = null;
	this.external_file_transfer = false;
	this.datagrams = false;

	this.quic_port = null;
	this.quic_host = null;
	
	this.client_ws_addr = null;
	this.server_ws_addr = null;

	this.client_session_id = null;
	this.server_session_id = null;

	this.on_start = null;
	this.on_capabilities = null;
	this.on_stop = null;

	this.client_stopped = true;
	this.server_stopped = true;
	
	this.caps = null;

	this.show_stats = true;
    }

    connect() {
	this.in_ws_connected = false;
	this.out_ws_connected = false;
	
	this.in_ws = new WebSocket(this.client_ws_addr);
	this.out_ws = new WebSocket(this.server_ws_addr);

	let pr = new Promise((resolve,reject) => {
	    this.in_ws.onopen = () => {
		this.in_ws_connected = true;
		if(this.out_ws_connected) {
		    resolve();
		}
	    };
	    this.out_ws.onopen = () => {
		this.out_ws_connected = true;
		if(this.in_ws_connected) {
		    resolve();
		}
	    };

	    this.in_ws.onerror = () => {
		reject("Could not connect to client");
		if(this.out_ws_connected) {
		    this.out_ws.close();
		}
	    };

	    this.out_ws.onerror = () => {
		reject("Could not connect to client");
		if(this.in_ws_connected) {
		    this.in_ws.close();
		}
	    };
	});

	this.in_ws.onmessage = (msg) => this.on_client_message(msg);
	this.out_ws.onmessage = (msg) => this.on_server_message(msg);

	return pr;
    }

    disconnect() {
	this.in_ws.close();
	this.out_ws.close();

	this.in_ws = null;
	this.out_ws = null;
    }

    on_client_message(msg) {
	let response = JSON.parse(msg.data);

	if(response.type === 'error') {
	    console.error("Error from client :" + response.data.message);
	}
	else if(response.type === "response") {
	    if(response.transId === START_REQUEST) {
		this.client_session_id = response.data.id;
		this.on_start();
		this.pc_manager.start();
		this.client_stopped = false;
	    }
	    else if(response.transId === STOP_REQUEST) {
		this.client_stopped = true;
		if(this.server_stopped) this.on_stop();
	    }
	    else if(response.transId === CAPABILITIES_REQUEST) {
		this.caps = response.data.in_impls;
		this.on_capabilities();
	    }
	}
    }

    on_server_message(msg) {
	let response = JSON.parse(msg.data);

	if(response.type === 'error') {
	    console.error("Error from server :" + response.data.message);
	}
	else if(response.type === "response") {
	    if(response.transId === START_REQUEST) {
		this.start_client();
		this.server_session_id = response.data.id;
		this.server_stopped = false;
	    }
	    else if(response.transId === STOP_REQUEST) {
		this.server_stopped = true;
		if(this.client_stopped) this.on_stop();
		
		this.get_stats();
	    }
	    else if(response.transId === UPLOAD_REQUEST) {

	    }
	    else if(response.transId === GETSTATS_REQUEST) {
		if(!this.show_stats) return;
		
		window.open(response.data.url, '_blank').focus();
	    
		if(response.data.tcp_url) window.open(response.data.tcp_url, '_blank').focus();
		if(response.data.qvis_url) window.open(response.data.qvis_url, '_blank').focus();
		if(response.data.medooze_url) window.open(response.data.medooze_url, '_blank').focus();
	    }
	}
    }

    query_capabilities() {
	const data = {
	    out_requested: false,
	    in_requested: true,
	};

	this.send_client_command("capabilities", CAPABILITIES_REQUEST, data);
    }

    get_stats() {
	let config = [ this.impl, this.cc, (this.datagrams ? "dgram" : "stream"), new Date().toJSON() ];
	if(this.external_file_transfer) config.push("scp");

	const data = {
	    exp_name: config.join("_"),
	    transport: ((this.impl == "tcp" || this.impl == "udp") ? this.impl : "quic"),
	    medooze_dump_url: this.medooze_manager.csv_url
	};

	this.send_server_command("getstats", GETSTATS_REQUEST, data);
    }

    run(constraints) {
	if(!this.running) return;
	
	if(constraints.length === 0) {
	    this.stop();
	    return;
	}

	const current = constraints.shift();
	
	if(current === null) {
	    this.stop();
	    return;
	}
	
	this.set_link(current[1], current[2], current[3]);
	this.pc_manager.link = current[1];

	setTimeout(() => this.run(constraints), current[0] * 1000);
    }
    
    start() {
	this.running = true;
	this.medooze_manager.start();
	this.start_server();
    }

    stop() {
	this.running = false;
	
	this.upload_stats();
	
	this.medooze_manager.stop();
	this.pc_manager.stop();
	
	this.stop_client();
	this.stop_server();
    }

    upload_stats() {
	const data = {
	    stats: this.pc_manager.stats
	};

	console.log(data);
	this.send_server_command("uploadstats", UPLOAD_REQUEST, data);
    }

    send_cmd(ws, cmd, req, data) {
	const obj = {
	    cmd: cmd,
	    transId: req,
	    data: data
	};
	
	ws.send(JSON.stringify(obj));
    }

    send_client_command(cmd, req, data) {
	this.send_cmd(this.in_ws, cmd, req, data);
    }
    
    send_server_command(cmd, req, data) {
	this.send_cmd(this.out_ws, cmd, req, data);
    }

    start_client() {
	const data = {
	    impl: this.impl,
	    datagrams: this.datagrams,
	    cc: this.cc,
	    quic_port: this.quic_port,
	    quic_host: this.quic_host,
	    external_file_transfer: this.external_file_transfer
	};

	this.send_client_command("startclient", START_REQUEST, data);
    }

    async start_server() {
	let medooze_port = await this.medooze_manager.get_rtp_port();
	
	const data = {
	    impl: this.impl,
	    datagrams: this.datagrams,
	    port_out: medooze_port,
	    addr_out: this.medooze_manager.url,
	    quic_port: this.quic_port,
	    quic_host: this.quic_host,
	    cc: this.cc,
	    external_file_transfer: this.external_file_transfer
	};

	this.send_server_command("startserver", START_REQUEST, data);
    }

    stop_client() {
	const data = {
	    id: this.client_session_id
	};

	this.send_client_command("stopclient", STOP_REQUEST, data);
    }

    stop_server() {
	const data = {
	    id: this.server_session_id
	};

	this.send_server_command("stopserver", STOP_REQUEST, data);
    }

    reset_link() {
	this.send_server_command("link", LINK_REQUEST, {});
    }

    set_link(bitrate, delay, loss) {
	const data = {
	    bitrate: bitrate,
	    delay: delay,
	    loss: loss
	};

	this.send_server_command("link", LINK_REQUEST, data);
    }
}

class MedoozeManager {

    constructor() {
	this.ws = null;
	this.probing_bitrate = 2000;
	this.probing = true;
	this.csv_url = null;

	this.url = null;
	this.port = null;
	
	this.onopen = null;
	this.onclose = null;
	this.onanswer = null;
    }

    start() {
	const ws_url = "wss://" + this.url + ":" + this.port;
	
	this.ws = new WebSocket(ws_url, "quic-relay-loopback");
	this.ws.onopen = () => this.onopen;
	this.ws.onclose = () => this.onclose;
	this.ws.onmessage = (msg) => {	    
	    let ans = JSON.parse(msg.data);

	    if(ans.answer) this.onanswer(ans.answer);
	    if(ans.url) this.csv_url = "https://" + this.url + ":" + this.port + ans.url;	    
	};
    }

    view(sdp) {	
	const cmd = {
	    cmd: "view",
	    offer: sdp,
	    probing: ((this.probing) ? this.probing_bitrate : 0),
	    constant_probing: this.probing_bitrate
	};
	
	this.ws.send(JSON.stringify(cmd));
    }
    
    stop() {
	this.ws.close();
	this.ws = null;
    }

    get_rtp_port() {
	const ws_url = "wss://" + this.url + ":" + this.port;
	let port_ws = new WebSocket(ws_url, "port");

	let promise = new Promise((resolve,reject) => {
	    port_ws.onmessage = msg => {
		resolve(JSON.parse(msg.data).port);
		port_ws.close();
	    };
	});

	return promise;
    }
    
}

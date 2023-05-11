
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

function setup_capabilities(tunnel_mgr) {
    console.log(tunnel_mgr.caps, tunnel_mgr.caps.length);
    
    // Display implementations    
    let container = create_radio_container("impl_container", "Quic implementation : ");
    tunnel_mgr.caps.forEach(e => create_radio_div(container.childNodes[0], "impl", e.impl));
    document.body.appendChild(container);
    setup_radio_cookies("impl");

    let impl_radio = document.getElementsByName("impl");
    impl_radio.forEach(e => {
	e.addEventListener('change', ev => {
	    let c = tunnel_mgr.caps.find(elt => elt.impl === ev.target.value);
	    show_impl_capabilities(c);
	    set_cookie("impl", ev.target.value, EXP_COOKIES);
	});

	if(e.checked) {
	    let c = tunnel_mgr.caps.find(elt => elt.impl === e.value);
	    show_impl_capabilities(c);
	}
    });  
}

function connect(tunnel_mgr) {
    let in_addr = document.getElementById("qclient").value;
    let out_addr = document.getElementById("qserver").value;

    set_cookie("in_addr", in_addr, EXP_COOKIES);
    set_cookie("out_addr", out_addr, EXP_COOKIES);
    
    tunnel_mgr.client_ws_addr = in_addr;
    tunnel_mgr.server_ws_addr = out_addr;
    
    return tunnel_mgr.connect();
}

function setup_connect(tunnel_mgr) {
    let button = document.getElementById('connect');

    tunnel_mgr.on_capabilities = () => {
	setup_capabilities(tunnel_mgr);
	setup_all(tunnel_mgr);
    };
    
    // Start/stop the experiment when start button is clicked
    button.onclick = (e) => {	
	if(button.innerHTML === "Connect") {
	    button.innerHTML = "Connecting";
	    button.disabled = true;

	    connect(tunnel_mgr)
		.then(() => {
		    button.innerHTML = "Disconnect";
		    button.disabled = false;
		    
		    if(tunnel_mgr.caps === null) tunnel_mgr.query_capabilities();
		})
		.catch((msg) => {
		    console.error(msg);
		    button.innerHTML = "Connect";
		    button.disabled = false;
		});
	}
	else {
	    button.innerHTML = "Connect";
	    tunnel_mgr.disconnect();
	}
    };
}

function get_radio_cap(name) {
    let radio = document.getElementsByName(name);
    let cap;

    radio.forEach((e) => { if(e.checked) cap = e.value; });

    return cap;
}

function setup_network_info(tunnel_mgr) {
    tunnel_mgr.medooze_manager.url = document.getElementById('medoozeaddr').value;
    tunnel_mgr.medooze_manager.port = parseInt(document.getElementById('medoozeport').value, 10);
    tunnel_mgr.medooze_manager.probing_bitrate = parseInt(document.getElementById('medoozeprobing').value, 10);
    tunnel_mgr.medooze_manager.probing = document.getElementById('medoozeprobingenable').checked;
    
    tunnel_mgr.quic_host = document.getElementById('qhost').value;
    tunnel_mgr.quic_port = parseInt(document.getElementById('qport').value, 10);

    set_cookie("qhost", tunnel_mgr.quic_host, EXP_COOKIES);
    set_cookie("qport", tunnel_mgr.quic_port, EXP_COOKIES);
    set_cookie("medoozeaddr", tunnel_mgr.medooze_manager.url, EXP_COOKIES);
    set_cookie("medoozeport", tunnel_mgr.medooze_manager.port, EXP_COOKIES);
    set_cookie("medoozeprobing", tunnel_mgr.medooze_manager.probing_bitrate, EXP_COOKIES);
    set_cookie("medoozeprobingenable", tunnel_mgr.medooze_manager.probing, EXP_COOKIES);
}

function start(tunnel_mgr) {
    setup_network_info(tunnel_mgr);
    
    tunnel_mgr.cc = get_radio_cap("cc");
    tunnel_mgr.impl = get_radio_cap("impl");
    tunnel_mgr.datagrams = get_radio_cap("datagrams") === "datagram";
    tunnel_mgr.external_file_transfer = get_radio_cap("filetransfer") === "external";

    tunnel_mgr.pc_manager.ontrack = (stream) => {
	const player = document.getElementById('remote');
	player.streamId =  stream.id;
	player.srcObject = stream;
	player.autoplay = true;
	player.playsInline = true;
    };
    
    tunnel_mgr.start();
}

function setup_call(tunnel_mgr) {
    let button = document.getElementById('call');
    
    tunnel_mgr.on_start = () => {
	// LINK
	const LOSS = 0;
	const DELAY = 50;
	const LINK_LIMIT = [[60, 1000, 1, 0], [30, 500, 1, 0], [30, 1000, 1, 0], [15, 2000, 1, 0],
	    // [30, 1000, 1, 0], [30, 1000, 1, 2], [30, 1000, 1, 4], [30, 1000, 1, 9], [30, 1000, 1, 15],
	    // [30, 500, 1, 0], [30, 500, 1, 2], [30, 500, 1, 4], [30, 500, 1, 9], [30, 500, 1, 15],
	    // [30, 2500, DELAY, 0], [30, 2500, DELAY, 5], [30, 2500, DELAY, 10], [30, 2500, DELAY, 20], [30, 2500, DELAY, 30]
	    // [10, 2500, DELAY, LOSS]
	]; // [time to wait, link cap, delay]
	
	button.innerHTML = "Stop";
	tunnel_mgr.run(LINK_LIMIT);
    };
    
    tunnel_mgr.on_stop = () => {
	button.innerHTML = "Start";
	button.disabled = false;
    };
    
    button.onclick = function(e) {
	if(button.innerHTML === "Start") {	    
	    start(tunnel_mgr);
	}
	else {
	    const player = document.getElementById('remote');
	    player.srcObject = null;
	    button.disabled = true;	    
	    tunnel_mgr.stop();
	}
    };
}


class ConstraintIterator {

    constructor(tunnel_mgr, repeat) {
	this.tunnel_mgr = tunnel_mgr;
	this.repeat = repeat;

	this.current_rep = 0;
	this.impl = 0;
	this.cc = 0;

	this.tunnel_mgr.external_file_transfer = false;	

	this.init_impl();
    }

    init_impl() {
	this.dgram = this.tunnel_mgr.caps[this.impl].datagrams;
	this.dgram_switch = this.tunnel_mgr.caps[this.impl].datagrams && this.tunnel_mgr.caps[this.impl].streams;
	
	this.tunnel_mgr.impl = this.tunnel_mgr.caps[this.impl].impl;
	this.tunnel_mgr.cc = this.tunnel_mgr.caps[this.impl].cc[this.cc];
	this.tunnel_mgr.datagrams = this.dgram;
    }
    
    next() {
	this.current_rep += 1;
	if(this.current_rep < this.repeat) return true;

	this.current_rep = 0;
	this.cc += 1;

	if(this.cc < this.tunnel_mgr.caps[this.impl].cc.length) {
	    this.tunnel_mgr.cc = this.tunnel_mgr.caps[this.impl].cc[this.cc];
	    return true;
	}

	this.cc = 0;
	this.tunnel_mgr.cc = this.tunnel_mgr.caps[this.impl].cc[this.cc];

	if(this.dgram_switch) {
	    this.dgram = !this.dgram;
	    this.tunnel_mgr.datagrams = this.dgram;
	    
	    if(!this.dgram) return true;
	}
	
	this.impl += 1;
	if(this.impl < this.tunnel_mgr.caps.length) {
	    this.init_impl();
	    // todo: re-factor this
	    if(this.tunnel_mgr.impl === "tcp") {
		this.impl += 1;
		if(this.impl < this.tunnel_mgr.caps.length) {
		    this.init_impl();
		    return true;
		}

		return false;
	    }
	    return true;
	}
	
	//the end
	return false;
    }
};

function setup_all(tunnel_mgr) {
    let button = document.getElementById('all');

    let it = new ConstraintIterator(tunnel_mgr, 2);
    /*tunnel_mgr.impl = "quicgo";
    tunnel_mgr.cc = "newreno";
    tunnel_mgr.datagrams = false;*/

    const LINK_LIMIT = [ [60, 2500, 1, 0], null, [60, 2500, 25, 0], null, [60, 2500, 50, 0], null, [60, 2500, 100, 0], null, [60, 2500, 400, 0], null,
			 [60, 2500, 1, 1], null, [60, 2500, 25, 1], null, [60, 2500, 50, 1], null, [60, 2500, 100, 1], null, [60, 2500, 400, 0], null,
			 [60, 2500, 1, 5], null, [60, 2500, 25, 5], null, [60, 2500, 50, 5], null, [60, 2500, 100, 5], null, [60, 2500, 400, 5], null,
			 [60, 2500, 1, 10], null, [60, 2500, 25, 10], null, [60, 2500, 50, 10], null, [60, 2500, 100, 10], null, [60, 2500, 400, 10]];

    let constraints = LINK_LIMIT.slice();

    tunnel_mgr.on_start = () => {
	console.log("start : ", tunnel_mgr.impl, tunnel_mgr.cc, tunnel_mgr.datagrams);

	tunnel_mgr.run(constraints);
    };
    
    tunnel_mgr.on_stop = () => {
	console.log("stop: ", constraints.length);
	
	if(constraints.length === 0) {
	    constraints = LINK_LIMIT.slice();
	    if(!it.next()) return;
	    // tunnel_mgr.datagrams = !tunnel_mgr.datagrams;
	    // if(!tunnel_mgr.datagrams) return;
	}

	tunnel_mgr.start(); // restart
    };
    
    button.onclick = (e) => {
	setup_network_info(tunnel_mgr);
	
	tunnel_mgr.show_stats = false;
	tunnel_mgr.pc_manager.ontrack = (stream) => {
	    const player = document.getElementById('remote');
	    player.streamId =  stream.id;
	    player.srcObject = stream;
	    player.autoplay = true;
	    player.playsInline = true;
	};
	
	tunnel_mgr.start();
    };
}

(function() {
    setup_cookies();

    let tunnel_mgr = new TunnelManager();
    
    let link_button       = document.getElementById('link');
    let reset_link_button = document.getElementById('resetlink');

    setup_connect(tunnel_mgr);
    setup_call(tunnel_mgr);

    // Manually set the tc constraints
    link_button.onclick = function(_) {
	// get values from HTML elements
	let bitrate = document.getElementById('bitrate');
	let delay = document.getElementById('delay');
	let loss = document.getElementById('loss');
	
	// Send command
	tunnel_mgr.set_link(parseInt(bitrate.value, 10), parseInt(delay.value, 10), parseInt(loss.value, 10));
    };

    // Button to remove all constraints on the link
    reset_link_button.onclick = (_) => tunnel_mgr.reset_link();
})();

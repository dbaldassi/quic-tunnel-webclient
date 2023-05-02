const EXP_COOKIES = 84; // 84 days

function set_cookie(name, value, exp_days) {
    const d = new Date();
    d.setTime(d.getTime() + (exp_days*24*60*60*1000));
    let expires = "expires=" + d.toUTCString();
    document.cookie = name + "=" + value + ";" + expires + ";path=/";
}


function get_cookie(name) {
    let n = name + "=";
    let decodedCookie = decodeURIComponent(document.cookie);
    let ca = decodedCookie.split(';');
    for(let i = 0; i < ca.length; i++) {
	let c = ca[i];
	while (c.charAt(0) == ' ') {
	    c = c.substring(1);
	}
	if (c.indexOf(n) == 0) {
	    return c.substring(n.length, c.length);
	}
    }
    return "";
}

function setup_radio_cookies(name) {
    let cookie = get_cookie(name);
    let radio = document.getElementsByName(name);

    if(!radio || radio.length === 0) return;
    
    let found = false;
    radio.forEach(e => {
	if(!found) {
	    found = cookie === e.value;
	    e.checked = found;
	} else {
	    e.checked = false;
	}
	e.addEventListener('change', ev => {
	    set_cookie(name, ev.target.value, EXP_COOKIES);
	});
    });
    if(!found) radio[0].checked = true;
}

function setup_cookies() {
    let in_addr = get_cookie("in_addr");
    document.getElementById('qclient').value = in_addr;
    let out_addr = get_cookie("out_addr");
    document.getElementById('qserver').value = out_addr;
    let qhost = get_cookie("qhost");
    document.getElementById('qhost').value = qhost;
    let qport = get_cookie("qport");
    document.getElementById('qport').value = qport;
    let medoozeurl = get_cookie("medoozeaddr");
    document.getElementById('medoozeaddr').value = medoozeurl;
    let medoozeport = get_cookie("medoozeport");
    document.getElementById('medoozeport').value = medoozeport;
    let medoozeprobing = get_cookie("medoozeprobing");
    document.getElementById('medoozeprobing').value = medoozeprobing;
    let medoozeprobingenable = get_cookie("medoozeprobingenable");
    document.getElementById('medoozeprobingenable').checked = medoozeprobingenable === 'true'; // js ...

    setup_radio_cookies("filetransfer");
}

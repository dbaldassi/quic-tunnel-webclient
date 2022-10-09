
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

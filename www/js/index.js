
function getLocalVideo() {
    return document.getElementById('local');
}

function getRemoteVideo() {
    return document.getElementById('remote');
}

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
    const stream = getLocalVideo().srcObject;

    pc.addEventListener('connectionstatechange', event => {
	console.log("local pc : " + pc.connectionState);
    });
    
    stream.getVideoTracks().forEach(t => pc.addTrack(t, stream));

    const offer = await pc.createOffer([{ offerToReceiveVideo: true, offerToReceiveAudio: false}]);
    await pc.setLocalDescription(offer);

    console.log({offer: offer});
    
    return { pc, offer };
}

let playing = true;

async function createRemotePeerConnection(configuration, offer) {
    const pc = new RTCPeerConnection(configuration);
    
    pc.addEventListener('track', async function(e) {
	console.log("on track");
	const [remoteStream] = e.streams;
	let remote = getRemoteVideo();
	remote.autoplay = true;
	remote.srcObject = remoteStream;
	remote.play();
    });

    pc.addEventListener('connectionstatechange', event => {
	console.log("remote pc : " + pc.connectionState);
    });

    await pc.setRemoteDescription(new RTCSessionDescription(offer));    
    const answer = await pc.createAnswer();
    console.log({answer:answer});

    await pc.setLocalDescription(answer);
    
    return { pc, answer };
}

async function start() {
    const stream = await getMedia();
    let local = getLocalVideo();
    local.srcObject = stream;
    local.onloadedmetadata = _ => local.play();

    let remote = getRemoteVideo();
    // remote.play();

    const relayConfiguration = {
	'iceServers': [
	    {
		urls:'turn:turn.dabaldassi.fr:3478',
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
    
    let local_pc    = await createLocalPeerConnection(relayConfiguration);
    let remote_pc   = await createRemotePeerConnection(configuration, local_pc.offer);
    await local_pc.pc.setRemoteDescription(remote_pc.answer);

    local_pc.pc.addEventListener('icecandidate', event => {
	console.log(event);
	if (event.candidate) {
	    console.log(event.candidate);
            remote_pc.pc.addIceCandidate(event.candidate);
	}
    });

    remote_pc.pc.addEventListener('icecandidate', event => {
	console.log(event);
	if (event.candidate) {
            local_pc.pc.addIceCandidate(event.candidate);
	}
    });
}

function stop() {
    let local = getLocalVideo();
    const stream = local.srcObject;
    const tracks = stream.getTracks();

    tracks.forEach(t => t.stop());
}

(function() {
    let callButton = document.querySelector('button');
    callButton.onclick = function(e) {
	console.log("click");
	console.log(callButton.innerHTML);
	if(callButton.innerHTML === "Start") {
	    callButton.innerHTML = "Stop";
	    start();
	} else {
	    callButton.innerHTML = "Start";
	    stop();
	}
    };
})();

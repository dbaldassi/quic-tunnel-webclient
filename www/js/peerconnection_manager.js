
class PeerconnectionManager {

    constructor() {
	this.pc = null;
	this.ontrack = null;
	this.onlocaldesc = null;
    }

    start() {
	this.pc = new RTCPeerConnection();
	this.pc.addEventListener('connectionstatechange', event => {
	    console.log("local pc : " + this.pc.connectionState);
	});
	this.pc.ontrack = (e) => {
	    const remoteStream = e.streams[0];
	    
	    this.ontrack(remoteStream);
	    
	    // get the video track object
	    let remotetrack = remoteStream.getVideoTracks()[0];

	    this.count = 0;
	    this.prev = 0;
	    this.prev_frames = 0;
	    this.prev_bytes = 0;
	    this.stats = [];

	    // get the RTC stats every 1s
	    let interval = setInterval(async () => {
		this.get_remote_stats(remotetrack);
		this.count++;
	    }, 1000);

	    // listen for ended event of video track to stop gathering the RTC stats
	    remotetrack.addEventListener("ended", (event) =>{
		console.debug("onended", event);
		// stop the interval timeout
		clearInterval(interval);
	    });
	};

	// add a recvonly transceiver for the video track
	this.pc.addTransceiver("video", { direction: "recvonly" });

	// create offer
	this.pc.createOffer()
	    .then((offer) =>
		this.pc.setLocalDescription(offer)
		    .then(this.onlocaldesc(offer.sdp))
	    );
    }

    set_remote_description(desc) {
	console.log("Set remote description");
	
	this.pc.setRemoteDescription(new RTCSessionDescription({
	    type:'answer',
	    sdp: desc
	}));
    }
 
    stop() {
	if(this.pc) {
	    this.pc.close();
	    this.pc = null;
	}
    }

    async get_remote_stats(track) {
	var results;
	// let remote = getRemoteVideo();

	try {
	    //For ff
	    results = await this.pc.getStats(track);
	} catch(e) {
	    //For chrome
	    results = await this.pc.getStats();
	}
	//Get results
	for (let result of results.values())
	{
	    if (result.type==="inbound-rtp")
	    {
		//Get timestamp delta
		var delta = result.timestamp - this.prev;
		//Store this ts
		this.prev = result.timestamp;

		//Get values
		// var width = track.width; // || remote.videoWidth;//result.stat("googFrameWidthReceived");
		// var height = track.height; // || remote.videoHeight;//result.stat("googFrameHeightReceived");
		var fps =  (result.framesDecoded - this.prev_frames) * 1000/delta;
		var kbps = (result.bytesReceived - this.prev_bytes) * 8/delta;
		if(kbps < 0) kbps = 0;
		//Store last values
		this.prev_frames = result.framesDecoded;
		this.prev_bytes  = result.bytesReceived;
		//If first
		if (delta==result.timestamp || isNaN(fps) || isNaN (kbps))
		    return;

		this.stats.push({
		    x: this.count,
		    bitrate: Math.floor(kbps),
		    fps: Math.floor(fps),
		    link: this.link,
		    frameDecoded: result.framesDecoded,
		    frameDropped: result.framesDropped,
		    keyFrameDecoded: result.keyFramesDecoded,
		    frameRendered: (result.framesRendered == undefined) ? 0 : result.framesRendered
		});
	    }
	}
    }
}

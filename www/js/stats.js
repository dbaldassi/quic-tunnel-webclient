
let stats = [];
let stats_send = [];

// LINK
const LOSS = 0;
const DELAY = 50;
const LINK_LIMIT = [// [60, 1000, 1, 0], [30, 500, 1, 0], [30, 1000, 1, 0], [15, 2000, 1, 0],
		    // [30, 1000, 1, 0], [30, 1000, 1, 2], [30, 1000, 1, 4], [30, 1000, 1, 9], [30, 1000, 1, 15],
		    // [30, 500, 1, 0], [30, 500, 1, 2], [30, 500, 1, 4], [30, 500, 1, 9], [30, 500, 1, 15],
		    // [30, 2500, DELAY, 0], [30, 2500, DELAY, 5], [30, 2500, DELAY, 10], [30, 2500, DELAY, 20], [30, 2500, DELAY, 30]
		    [60, 2500, DELAY, LOSS]
		   ]; // [time to wait, link cap, delay]
// const LINK_LIMIT = [[2, 1000, 1], [2, 500, 1], [2, 1000, 1]]; // [time to wait, link cap, delay]

var prev = 0, prevFrames = 0, prevBytes = 0;

let current_link = 0;

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

if(gauges[4]) gauges[4].maxValue = 1024;

var texts =  document.querySelectorAll('.gaugeChartLabel');

async function get_remote_stats(pc, track, count) {
    var results;
    // let remote = getRemoteVideo();

    try {
	//For ff
	results = await pc.getStats(track);
    } catch(e) {
	//For chrome
	results = await pc.getStats();
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
	    // var width = track.width; // || remote.videoWidth;//result.stat("googFrameWidthReceived");
	    // var height = track.height; // || remote.videoHeight;//result.stat("googFrameHeightReceived");
	    var fps =  (result.framesDecoded-prevFrames)*1000/delta;
	    var kbps = (result.bytesReceived-prevBytes)*8/delta;
	    if(kbps < 0) kbps = 0;
	    //Store last values
	    prevFrames = result.framesDecoded;
	    prevBytes  = result.bytesReceived;
	    //If first
	    if (delta==result.timestamp || isNaN(fps) || isNaN (kbps))
		return;

	    for (var i=0;i<targets.length;++i)
		gauges[i].animationSpeed = 10000000; // set animation speed (32 is default value)
	    
	    // gauges[0].set(width);
	    // gauges[1].set(height);
	    gauges[2].set(Math.min(Math.floor(fps)   ,30));
	    gauges[3].set(Math.min(Math.floor(kbps) ,1024));
	    // texts[0].innerText = width;
	    // texts[1].innerText = height;
	    texts[2].innerText = Math.floor(fps);
	    texts[3].innerText =  Math.floor(kbps);

	    stats.push({
		x: count,
		bitrate: Math.floor(kbps),
		fps: Math.floor(fps),
		link: LINK_LIMIT[current_link][1],
		frameDecoded: result.framesDecoded,
		frameDropped: result.framesDropped,
		keyFrameDecoded: result.keyFramesDecoded,
		frameRendered: (result.framesRendered == undefined) ? 0 : result.framesRendered
	    });
	    
	    ++count;
	}
    }
}

function set_link_interval(ws, current, onfinish) {
    if(current >= LINK_LIMIT.length) {
	console.log(stats);
	onfinish(stats);
	stats = [];
    } else {
	current_link = current;
	let link = LINK_LIMIT[current];
	let time = link[0];
	let bitrate = link[1];
	let delay = link[2];
	let loss = link[3];

	if(bitrate === null) reset_link(ws);
	else {
	    let linkObject = {
		cmd: "link",
		transId: LINK_REQUEST,
		data: {
		    bitrate: bitrate,
		    delay: delay,
		    loss: loss
		}
	    };

	    ws.send(JSON.stringify(linkObject));
	}

	setTimeout(set_link_interval, time * SEC, ws, current + 1, onfinish);
    }
}

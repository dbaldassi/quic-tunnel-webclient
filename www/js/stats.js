
let stats = [];
let stats_send = [];

// LINK
const LINK_LIMIT = [[60, 1000, 1], [30, 500, 1], [30, 1000, 1]]; // [time to wait, link cap, delay]
// const LINK_LIMIT = [[2, 1000, 1], [2, 500, 1], [2, 1000, 1]]; // [time to wait, link cap, delay]

let link_chart = [];

var prev = 0, prevFrames = 0, prevBytes = 0;
var prev1 = 0, prevFrames1 = 0, prevBytes1 = 0;
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
    let remote = getRemoteVideo();

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
	    var width = track.width || remote.videoWidth;//result.stat("googFrameWidthReceived");
	    var height = track.height || remote.videoHeight;//result.stat("googFrameHeightReceived");
	    var fps =  (result.framesDecoded-prevFrames)*1000/delta;
	    var kbps = (result.bytesReceived-prevBytes)*8/delta;
	    //Store last values
	    prevFrames = result.framesDecoded;
	    prevBytes  = result.bytesReceived;
	    //If first
	    if (delta==result.timestamp || isNaN(fps) || isNaN (kbps))
		return;

	    for (var i=0;i<targets.length;++i)
		gauges[i].animationSpeed = 10000000; // set animation speed (32 is default value)
	    gauges[0].set(width);
	    gauges[1].set(height);
	    gauges[2].set(Math.min(Math.floor(fps)   ,30));
	    gauges[3].set(Math.min(Math.floor(kbps) ,1024));
	    texts[0].innerText = width;
	    texts[1].innerText = height;
	    texts[2].innerText = Math.floor(fps);
	    texts[3].innerText =  Math.floor(kbps);

	    stats.push({x: count, y: Math.floor(kbps)});
	    link_chart.push({x: count, y: LINK_LIMIT[current_link][1]});
	    ++count;
	}
    }
}

async function get_local_stats(pc, track, count) {
    var results;

    try {
	//For ff
	results = await pc.getStats(track);
    } catch(e) {
	//For chrome
	results = await pc.getStats();
    }
    //Get results
    for (let result of results.values()) {
	if (result.type === "outbound-rtp") {
	    //Get timestamp delta
	    var delta = result.timestamp - prev1;
	    //Store this ts
	    prev1 = result.timestamp;
	    
	    var kbps = (result.bytesSent - prevBytes1) * 8 / delta;
	    //Store last values
	    prevBytes1 = result.bytesSent;
	    //If first	    
	    if (delta == result.timestamp || isNaN(kbps)) return;

	    gauges[4].set(Math.min(Math.floor(kbps) ,1024));
	    texts[4].innerText =  Math.floor(kbps);

	    stats_send.push({x: count, y: Math.floor(kbps)});
	}
    }
}

function display_chart() {
    $.get("https://canvasjs.com/services/data/datapoints.php?xstart=5&ystart=10&length=10&type=csv",
	  function(data) {
	      var chart = new CanvasJS.Chart("chartContainer", {
		  title: {
		      text: "Chart from CSV",
		  },
		  data: [{
		      type: "line",
		      dataPoints: stats
		  }, {
		      type: 'line',
		      dataPoints: link_chart
		  }, {
		      type: 'line',
		      dataPoints: stats_send
		  }]
	      });
	      
	      chart.render();
	  });

    for(let i = 0; i < stats.length; ++i) {
	console.log(stats[i].x + "," + stats[i].y + "," + link_chart[i].y);
    }
}

function set_link_interval(ws, current, onfinish) {
    if(current >= LINK_LIMIT.length) {
	onfinish();
    } else {
	current_link = current;
	let link = LINK_LIMIT[current];
	let time = link[0];
	let bitrate = link[1];
	let delay = link[2];

	if(bitrate === null) reset_link(ws);
	else {
	    let linkObject = {
		cmd: "link",
		transId: LINK_REQUEST,
		data: {
		    bitrate: bitrate,
		    delay: delay
		}
	    };

	    ws.send(JSON.stringify(linkObject));
	}

	setTimeout(set_link_interval, time * SEC, ws, current + 1, onfinish);
    }
}

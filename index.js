const https           = require('https');
const fs              = require('fs');
const Express         = require('express');
const CORS            = require('cors');
const WebsocketServer = require('websocket').server;

const PORT = 8888;

const options = {
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem')
};

// function wss(server) {
//     const wsServer = new WebsocketServer({
// 	httpServer: server,
// 	autoAcceptConnections: true
//     });

//     wsServer.on("message", (frame) => {
	
//     });
// }

const rest = Express();
rest.use(CORS());
rest.use(Express.static('www'));

https.createServer(options, rest).listen(PORT);


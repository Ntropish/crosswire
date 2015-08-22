//==============================================================================
//                                  CROSS WIRE
//==============================================================================


//================================GET=PORT======================================
var port = process.env.PORT || 8080;

//================================GET=DEPENDENCIES==============================
var path =       require('path');
var http =       require('http');
var express =    require('express');
var io =         require('socket.io')();
var mongoose =   require('mongoose');
var jwt =        require('jsonwebtoken');
var ioWildcard = require('socketio-wildcard');

//================================MISC=CONFIG===================================

require('./config')();

mongoose.connect(process.env.MONGOLAB_URI || process.env.MONGODB_URI);

// ===============================MODELS========================================
require('./models/playlist.js')(mongoose);
require('./models/user.js')(mongoose);

//================================CONFIGURE=EXPRESS=============================
//==============================================================================

var app = express();

// Statically serve public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve SPA
app.get('/', function(req, res){
  res.sendFile('index.html', {root: path.join(__dirname, 'public', 'html')});
});



//==============================================================================
//================================CONFIGURE=SOCKET.IO===========================
//==============================================================================

require('./socket/namespaces/playlist.js')(io);
require('./socket/namespaces/user.js')(io);

//==============================================================================
//================================MAKE=SERVER===================================
var httpServer = http.createServer(app); //OPTIONS HERE
io.listen(httpServer);
//================================START=SERVER==================================
httpServer.listen(port);
console.log('listening on port:', port);

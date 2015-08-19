//==============================================================================
//                                  CROSS WIRE
//==============================================================================

//==================================CONFIGURE=KEYS==============================
var fs = require('fs');

var hskey = fs.readFileSync('./keys/keys01/ntropish-key.pem');
var hscert = fs.readFileSync('./keys/keys01/ntropish-cert.pem');

var options = {
  key: hskey,
  cert: hscert
};

//================================GET=PORT======================================
var port = process.env.PORT || 8080;

//================================GET=DEPENDENCIES==============================
var path =       require('path');
var morgan =     require('morgan');
var bodyParser = require('body-parser');
var https =      require('https');
var express =    require('express');
var io =         require('socket.io')();
var mongoose =   require('mongoose');
var jwt =        require('jsonwebtoken');
var ioWildcard = require('socketio-wildcard');

//================================MISC=CONFIG===================================

//require('./config')();
mongoose.connect(process.env.MONGOLAB_URI);

// ===============================MODELS========================================
require('./models/playlist.js')(mongoose);
require('./models/user.js')(mongoose);

//================================CONFIGURE=EXPRESS=============================
//==============================================================================

var app = express();

// Statically serve public directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Serve SPA
app.get('/', function(req, res){
  //res.send('index');
  res.sendFile('index.html', {root: path.join(__dirname, 'public', 'html')});
});



//==============================================================================
//================================CONFIGURE=SOCKET.IO===========================
//==============================================================================
/*
io.use(ioWildcard());

io.use(function(socket, next){
  require('./socket/authenticate-token.js')(socket);
  next();
});
*/
require('./socket/namespaces/playlist.js')(io);
require('./socket/namespaces/user.js')(io);

//==============================================================================
//================================MAKE=SERVER===================================
var httpsServer = https.createServer(options, app);
io.listen(httpsServer);
//================================START=SERVER==================================
httpsServer.listen(port);

var tape = require('tape');
var io = require('socket.io-client');

var socketURL = 'http://localhost:8080/user';

var options = {
  transports: ['websocket'],
  'force new connection': true
};

var authenticate = function authenticate(model, client, username, password){

  // Send authentication request
  client.emit('authenticate', {username: username, password: password});

  // Return promise that resolves upon response
  return new Promise(function(resolve, reject){

    // What to do upon response
    var resultHandler = function resultHandler(data){
      console.log('DATA:', data);
      clearTimeout(timeout);

      // Check for failure
      if (!data.success) {
        // Resolve with false on unsuccessful login
        if (data.message) {
          model.message = data.message;
        }
        return resolve(false);
      }

      // Update model based on response
      if (data.token) {
        model = data.token;
      }
      if (data.username) {
        model = data.username;
      }
      if (data.friends) {
        model = data.friends;
      }
      // Resolve true on a successfull login
      return resolve(true);
    };

    // Prepare for no response
    var timeout = setTimeout(function(){
      console.log('NO RESPONSE');
      client.removeListener('authenticate-result', resultHandler);
      reject('No response upon authentication.');
    }, 500);


    client.once('authenticate-result', resultHandler);
  });


};

var joinRoom = function joinRoom(model, client, roomName){
  // Emit join event using the JWT from the model and the provided room name
  client.emit('join', {token: model.token, room: roomName});

  // Return promise that resolves upon response
  return new Promise(function(resolve, reject){

    // What to do upon response
    var resultHandler = function resultHandler(data){
      clearTimeout(timeout);

      // Check for failure
      if (!data.success) {
        // Resolve with false on unsuccessful login
        if (data.message) {
          model.message = data.message;
        }
        return resolve(false);
      }

      // Update model based on response
      if (data.room) {
        model.room = data.room;
      }
      if (data.username) {
        model = data.username;
      }
      if (data.friends) {
        model = data.friends;
      }
      // Resolve true on a successfull login
      return resolve(true);
    };

    // Prepare for no response
    var timeout = setTimeout(function(){
      client.removeListener('join-result', resultHandler);
      reject('No response upon room join.');
    }, 500);


    client.once('join-result', resultHandler);

  });



};


tape('User session tests', function(t){
  var client = io.connect(socketURL);



  // This variable holds a model of the client state
  var model = {};

  [ // Task list
    authenticate(model, client, 'test', 'Testing1'),

    function verifyLogin(success) {
      t.ok(success, 'User should successfully log in');
      if (success) {
        return Promise.reject(new Error());
      }
      return Promise.resolve();
    },

    joinRoom(model, client, 'test')
  ]
    .reduce(function (previous, returnPromise) {
                return previous.then(returnPromise);
            }, Promise.resolve())
            .then(function finalResolveSuccess(){
              console.log(model);
              t.equal(model.username, 'test', 'Username should be test');
              client.disconnect();
              t.end();
            }, function finalResolveFailure(err){
              t.error(err, "session should complete without errors.");
              client.disconnect();
              t.end();
            });

});

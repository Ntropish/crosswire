var jwt = require('jsonwebtoken');

module.exports = function(socket) {
  socket.on('*', function(event) {
    // Set data.payload to a promise that resolves with
    // the decoded token, or nothing if no token exists.
    // All logical paths must set data.payload to avoid spoofing
    if (event.data[1].token) {
      event.data[1].payload = new Promise(function(resolve, reject) {
        var token = event.data[1].token;
        jwt.verify(token, process.env.secret, function(err, decoded){
          if (err) {
            reject(err);
          } else {
            resolve(decoded);
          }
        });
      }).then(function(decodedToken){

        // Identify name changes on the socket
        if (socket.username && socket.username !== decodedToken.username) {
          socket.userChanged = true;
          // Track old name for removing from user lists
          socket.oldName = socket.username;
        }
        else {
          socket.userChanged = false;
        }

        // Save username to the socket so playlist namespace can track disconnects
        socket.username = decodedToken.username;

        return decodedToken;
      });
    } else {
      event.data[1].payload = Promise.reject('No token given');
    }
  });

};

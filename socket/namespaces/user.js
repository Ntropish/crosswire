var mongoose = require('mongoose');
var User = mongoose.model('User');
var jwt = require('jsonwebtoken');
var ioWildcard = require('../socketio-pre-event');

module.exports = function(io) {
  'use strict';
  var userNSP = io.of('user');

  userNSP.use(ioWildcard());

  userNSP.use(function(socket, next){

    // Use JWT middleware
    require('../authenticate-token.js')(socket);

    socket.on('register', function(data){
      var validatePassword = function validatePassword(password) {
        // This function is synchronous
        // Runs a series of checks with regex, if all tests pass
        // the password is valid.
        // Returns the result object with appropriate message and success value

        var result = {
          success: false,
          message: ''
        };
        if (!password) {
          result.message = 'No password provided';
        }
        else if (password.match(/^.{0,7}$/)) {
          result.message = 'Your password too short.';
        }
        else if (password.match(/^.{21,}$/)) {
          result.message = 'Your password too long.';
        }
        else if (!password.match(/\d/)) {
          result.message = 'Your password needs a number.';
        }
        else if (!password.match(/[A-Z]+/) || !password.match(/[a-z]+/) ) {
          result.message = 'Your password must be mixed case.';
        }
        else {
          result.success = true;
        }
        return result;
      };

      var validateUsername = function validateUsername(username) {
        // This function is async to check the db for existing username.
        // Returns a promise that resolves with the result object.
        // Returns prommise immediately if username is invalid or
        // does a db check if valid.
        var result = {
          success: false,
        };

        if (!username) {
          result.message = 'No username provided';
          return Promise.resolve(result);
        }
        else if (username.match(/^.{0,2}$/)) {
          result.message = 'Your username is too short.';
          return Promise.resolve(result);
        }
        else if (username.match(/^.{21,}$/)) {
          result.message = 'Your username is too long.';
          return Promise.resolve(result);
        }
        else if (username.match(/^[A-Za-z0-9]+(?:[ _-][A-Za-z0-9]+)*$/)) {
          return User.findOne({username: username}).exec().then(function(user){
            if (user) {
              result.message = 'That username is taken.';
              return result;
            }
            result.success = true;
            return result;
          });
        } else {
          result.message = 'Usernames should only contain letters and numbers '+
          'and have dots (.) or underscores (_) as separators.';
          return Promise.resolve(result);
        }

      };

      var createUser = function createUser(username, password) {
        var newUser = new User({username: username, password: password});
        return newUser.save();
      };

      var username = data.username;
      var password = data.password;
      var passwordValid = validatePassword(password);

      if (passwordValid.success) {
        validateUsername(username).then(function(result){
          if (result.success) {
            createUser(username, password).then(function(){
              // Emit result after save so the client doesn't
              // attept login before user is in database
              socket.emit('register-result', result);
            });
          } else {
            socket.emit('register-result', result);
          }
        });
      } else {
        socket.emit('register-result', passwordValid);
      }

    });

    socket.on('unregister', function(data){
      data.payload.then(function(payload){
        User.findOne({username: payload.username}).remove().exec()
          .then(function(){
            socket.emit('unregister-response', {success: true});
          },function(){
            socket.emit('unregister-response', {
              success: false,
              message: 'Database error when finding you.'
            });
          });
      },function(reason){
        socket.emit('unregister-response', {success: false, message: reason});
      });

    });

    socket.on('authenticate', function(data){
      // Check for lack of username.
      if (!data.username) {
        socket.emit('authenticate-result', {
          success: false,
          message: 'No username given.'}
        );
        return;
      }
      // Check for lack of password.
      if (!data.password) {
        socket.emit('authenticate-result', {
          success: false,
          message: 'No password given.'}
        );
        return;
      }

      User.findOne({username: data.username}).populate('friends').exec().then(function(user){
        if (user) {
          user.verifyPassword(data.password, function(err, isMatch){
            if (err) {
              return socket.emit('authenticate-result', {message: 'Database error.'});
            }
            if (isMatch) {
              console.log('signing');
              var token = jwt.sign(
                {username: user.username},
                process.env.secret,
                {expiresInMinutes: 1440}
              );
              socket.emit('authenticate-result', {
                success: true,
                token: token,
                username: data.username,
                friends: user.friends.map(function(friend){return friend.username;})
              });

            } else {
              socket.emit('authenticate-result', {
                success: false,
                message: 'That password isn\'t right.'
              });
            }
          });
        } else {
          socket.emit('authenticate-result', {success: false, message: 'User not found.'});
        }
      });
    });

    socket.on('add-friend', function(data){

      var results = {};
      [
        // Resolve payload from token
        function() {
          if (data.payload) {
            return data.payload;
          } else {
            return Promise.reject('Must be authorized to add friend.');
          }
        },

        // Get requesting user
        function(payload) {
          if(payload.username) {
            return User.findOne({username: payload.username}).exec();
          } else {
            return Promise.reject('Must be authorized to add friend');
          }
        },

        function(user) {
          // Get potential friend
          return User.findOne({username: data.friendToBe}).exec()
            .then(function(friend){
              if (friend) {
                results = {friend: friend, user: user};
                return Promise.resolve();
              } else {
                return Promise.reject('Potential friend not found.');
              }
            }, function(err) {
              return Promise.reject('Database error finding potential friend.');
            });
        },
        function() {
          if (results.user.friends.indexOf(results.friend._id) !== -1) {
            return Promise.reject('That dude is already your friend.');
          } else {
            return Promise.resolve();
          }
        },

        function(data) {
          data.user.friends.push(data.friend._id);
          return data.user.save();
        }
      ]
        .reduce(function(previous, returnPromise) {
          return previous.then(returnPromise);
        }, Promise.resolve())
          .then(function () {
            socket.emit('add-friend-response',
            {success: true, friend: data.friendToBe, message: 'Added friend!'}
          );
          }, function (reason) {
            console.log(reason);
            socket.emit('add-friend-response',
            {success: false, message: reason}
          );
        });
    });

    socket.on('remove-friend', function(data){
      [
        // Resolve payload from token
        function() {
          if (data.payload) {
            return data.payload;
          } else {
            return Promise.reject('Must be authorized to remove friend.');
          }
        },

        // Get requesting user
        function(payload) {
          if(payload.username) {
            return User.findOne({username: payload.username}).exec();
          } else {
            return Promise.reject('Must be authorized to remove friend');
          }
        },
        function(user) {
          // Get potential friend
          return User.findOne({username: data.friendNoMore}).exec()
            .then(function(friend){
              if (friend) {
                return Promise.resolve({friend: friend, user: user});
              } else {
                return Promise.reject('Friend to be removed not found in database.');
              }
            }, function(err) {
              return Promise.reject('Database error finding friend to be removed.');
            });
        },
        function(data) {
          var friendIndex = data.user.friends.indexOf(data.friend._id);
          console.log(data.user.friends);
          console.log(data.friend._id);
          if (friendIndex !== -1) {
            data.user.friends.splice(friendIndex, 1);
            return data.user.save();
          } else {
            return Promise.reject('User not in friend list.');
          }

        }
      ]
        .reduce(function(previous, returnPromise) {
          return previous.then(returnPromise);
        }, Promise.resolve())
          .then(function () {
            socket.emit('remove-friend-response',
            {success: true}
          );
          }, function (reason) {
            console.log(reason.stack);
            socket.emit('remove-friend-response',
            {success: false, message: reason}
          );
        });
    });

    next();

  });
};

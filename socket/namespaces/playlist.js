var mongoose = require('mongoose');
var Playlist = mongoose.model('Playlist');
var User = mongoose.model('User');
var ioWildcard = require('../socketio-pre-event');

module.exports = function(io) {
  'use strict';

  // Promise returning function to check if user has some permission
  var authorize = function authorize(playlist, user, permission) {

    if (playlist === undefined) {
      return Promise.reject('Playlist is undefined.');
    }

    // Anybody is authorized
    if (playlist[permission] === 2) {
      return Promise.resolve(true);
    }

    // Beyond this point only users can be authorized so reject non users now
    if (user === undefined) {
      return Promise.reject('You must be logged in to do that.');
    }

    // Only friends are authorized
    else if (playlist[permission] === 1) {

      if (playlist.owner === user.username) {
        return Promise.resolve(true);
      }
      return User.findOne({username: playlist.owner}).exec().then(function (owner) {
        if (owner) {
          if (owner.friends.indexOf(user._id) !== -1) {
            return Promise.resolve(true);
          } else {
            return Promise.resolve(false);
          }
        } else {
          return Promise.reject('Owner of playlist not found.');
          // Only the owner is authorized
        }
      }, handleError);
    }
    else if (playlist[permission] === 0) {
      if (playlist.owner === user.username) {
        return Promise.resolve(true);
      }
      return Promise.resolve(false);
    }
    // User is not authorized if the previous cases didn't match
    else {
      return Promise.resolve(false);
    }
  };

  var getPlaylist = function getPlaylist(socket) {
    // Get the playlist the user is in by matching room
    // name to playlist owner
    return Playlist.findOne({owner: socket.rooms[0]}).exec();
  };

  var handleError = function handleError(err){console.log(err);};

  var removeFromUserlist = function removeFromUserlist(username, room) {
    Playlist.findOne({owner: room}).exec().then(function(playlist){
      var nameIndex = playlist.userlist.indexOf(username);
      if ( nameIndex !== -1 ) {
        playlist.userlist.splice(nameIndex, 1);
        playlist.save();
        playlistNSP.to(room).emit('playlist-userlist', {userlist: playlist.userlist});
      }
    });
  };

  var sendPlaylistMessage = function sendPlaylistMessage(playlist, message) {
      playlistNSP.to(playlist.owner).emit('playlist-message', {message: message});
  };
  // Session namespace for playlists, rooms are joined with names of playlist owners
  // To join Doug's room join the 'Doug' room in this namespace
  var playlistNSP = io.of('playlist');


  // Override onevent to allow wildcard events
  playlistNSP.use(ioWildcard());

  // Define event handlers
  playlistNSP.use(function (socket, next) {

    // Add wildcard event as JWT middleware
    require('../authenticate-token.js')(socket);

    socket.on('disconnect', function(){

      removeFromUserlist(socket.username, socket.recentPlaylist);

    });

    socket.on('*namechange*', function(data){
      if (socket.userChange) {
        // Leave rooms/playlist scocket was in, socket must reauthorize
        // This event happens before common events so it will not cancel joins
        socket.rooms.forEach(function(room){
          // Leave socket.io room
          socket.leave(room);
          // Remove username from userlist
          removeFromUserlist(socket.oldName, room);
        });
      }
    });

    socket.on('time-response', function(data){
      playlistNSP.to(socket.rooms[0]).emit('playlist-state', {time: data.time});
    });

    socket.on('time-request', function(data){
      playlistNSP.to(socket.rooms[0]).emit('time-request');
    });

    // Event to leave all rooms and join the one given if authorized
    socket.on('join', function (data) {

      playlistNSP.to(socket.rooms[0]).emit('user-action', {
        username: socket.username,
        action: 'join'
      });

      // Store data from promises below here.
      // Not in 'data' because it comes from the user and would
      // require cleaning.
      var results = {};

      [
        // Resolve payload decryption and store
        function() {
          return data.payload.then(function(resolvedPayload){
            results.resolvedPayload = resolvedPayload;
          },function(reason){
            // Payload not necessary to join all channels so allow a failure
            // to resolve.
            return Promise.resolve();
          });
        },
        // Find user document for user requesting join
        function() {
          if (!results.resolvedPayload) {
            // If no valid token was sent, attempt to continue without a user
            return Promise.resolve();
          }
          return User.findOne(
            {username: results.resolvedPayload.username}
          ).then(function(user){
            results.user = user;
          }, function(error) {
            // Existant user not required to join all channels so
            // allow a failure to resolve.
            return Promise.resolve();
          });
        },
        // Get playlist
        function() {
          if (!data.room) {
            return Promise.reject('A room name must be provided.');
          }
          return Playlist.findOne({owner: data.room}).exec()
          .then(function(playlist){
            if (playlist) {
              // Existing playlist was found so return it
              results.playlist = playlist;
              return Promise.resolve();
            } else if(results.user.username === data.room) {
              // Create playlist if user is trying to join their own room
              // and it is non existent.
              return Playlist.create(
                {owner: results.user.username},
                function (err, newPlaylist) {
                  if (err) {
                    throw err;
                  }
                  results.playlist = newPlaylist;
                  return Promise.resolve();
                });
              } else {
                return Promise.reject('No playlist found.');
              }
            });
          },
          // authorize user
          function() {
            return authorize(results.playlist, results.user, 'joinPermission')
              .then(function(isAuthorized){
                if (!isAuthorized) {
                  return Promise.reject('You aren\'t authorized to join that room.');
                }
              });
          },
          // Join playlist
          function() {
            // Leave rooms/playlist scocket was already in
            socket.rooms.forEach(function(room){

              // Due to async nature of events, do not rely on socket.join
              // below to reenter room if just leaving
              if (room === data.room) {
                return;
              }
              // Leave socket.io room
              socket.leave(room);
              // Remove user from old playlists
              removeFromUserlist(socket.username, room);
            });

            // Join new room/playlist
            return new Promise(function(resolve, reject){
              socket.join(data.room, function(err){
                if (err) {
                  return reject(err);
                }

                // Add to userlist
                if (results.playlist.userlist.indexOf(socket.username) === -1) {
                  results.playlist.userlist.push(socket.username);
                  results.playlist.save();
                }
                socket.recentPlaylist = data.room;
                return resolve();
              });
            });

          }

        ]
        // Final resolve
        .reduce(function(previous, returnPromise) {
          return previous.then(returnPromise);
        }, Promise.resolve())
        .then(function () {
          authorize(
            results.playlist,
            results.user,
            'addPermission')
            .then(function(isAuthorized) {
              var playlistReport = {
                list: results.playlist.playlist,
                isPlaying: results.playlist.isPlaying,
                nowPlaying: results.playlist.nowPlaying,
                addPermission: isAuthorized
              };


              // Send responses to socket
              socket.emit('join-response',
                {success: true, room: data.room}
              );
              socket.emit('playlist-state', playlistReport);


              socket.emit('permission-update', {
                join: results.playlist.joinPermission,
                add: results.playlist.addPermission,
                modify: results.playlist.modifyPermission
              });


              // Inform playlist room of new user
              playlistNSP.to(socket.rooms[0]).emit('playlist-userlist',
                {userlist: results.playlist.userlist});

            }
        );

        }, function (reason) {
          socket.emit('join-response',
          {success: false, message: reason}
        );
      });
    });

    socket.on('leave', function(data){
      removeFromUserlist(socket.username, socket.rooms[0]);
      socket.leave(socket.rooms[0]);
    });

    socket.on('permissions', function(data){
      Playlist.findOne({owner: socket.username}).exec().then(

        function(playlist){
          if (!playlist) {
            return;
          }
          if (typeof data.join === 'number') {
            playlist.joinPermission = data.join;
          }
          if (typeof data.add === 'number') {
            playlist.addPermission = data.add;
          }
          if (typeof data.modify === 'number') {
            playlist.modifyPermission = data.modify;
          }
          playlist.save();
          playlistNSP.to(socket.username).emit('permission-update', {
            join: playlist.joinPermission,
            add: playlist.addPermission,
            modify: playlist.modifyPermission
          });
        });
    }, function(err){
      console.log(err);
    });

    /*==========================================================================
    add
    ---
    Add song to playlist, song should be a url
    ==========================================================================*/
    socket.on('add', function (data) {
      getPlaylist(socket).then(function(playlist){

        playlistNSP.to(socket.rooms[0]).emit('user-action', {
          username: socket.username,
          action: 'add'
        });
        //======================================================================
        //                          Validate Data
        //======================================================================
        if (!playlist) {
          return socket.emit('playlist-error', {
            success: false,
            message: 'Playlist not found.'
          });
        }

        if (typeof data.url !== 'string') {
          return socket.emit('playlist-error', {
            success: false,
            message: 'Invalid url sent.'
          });
        }

        if (typeof data.title !== 'string') {
          return socket.emit('playlist-error', {
            success: false,
            message: 'Invalid title sent.'
          });
        }

        //======================================================================
        //                          Perform Action
        //======================================================================

        [
          function() {
            return data.payload;
          },
          function(decryptedPayload) {
            return Promise.resolve(decryptedPayload.username);
          },
          function(username) {
            return User.findOne({username: username}).exec();
          },
          function(user) {
            return authorize(playlist, user, 'addPermission');
          },
          function(isAuthorized) {
            if (isAuthorized) {
              return Promise.resolve();
            }
            return Promise.reject('You are authorized to add songs :(');
          }
        ]
        .reduce(function(previous, returnPromise) {
          return previous.then(returnPromise);
        }, Promise.resolve())
        .then(function () {            //Add url to playlist document
          playlist.playlist.push({url: data.url, title: data.title});

          // Create state to send to client
          var playlistState = {
            list: playlist.playlist
          };

          // Send state to client
          playlistNSP.to(socket.rooms[0]).emit('playlist-state', playlistState);

          // Save playlist document
          playlist.save().catch(handleError);
        }, function(err){
          socket.emit('playlist-error', {message: err});
        });

      }, handleError);

    });

    /*==========================================================================
    play-pause
    ----------
    Change the isPlaying boolean, play/true pause/false.
    This action updates the time, send in data.time
    ==========================================================================*/
    socket.on('play-pause', function (data) {
      getPlaylist(socket).then(function(playlist){

        playlistNSP.to(socket.rooms[0]).emit('user-action', {
          username: socket.username,
          action: 'play-pause'
        });
        //======================================================================
        //                          Validate Data
        //======================================================================

        if (!playlist) {
          return socket.emit('playlist-error', {
            success: false,
            message: 'Playlist not found.'
          });
        }

        if (typeof data.isPlaying !== 'boolean') {
          return socket.emit('playlist-error', {
            success: false,
            message: 'Invalid isPlaying sent.'
          });
        }
        if (data.time && typeof data.time !== 'number') {
          return socket.emit('playlist-error', {
            success: false,
            message: 'Invalid time sent.'
          });
        }

        //======================================================================
        //                          Perform Action
        //======================================================================

        // Construct state
        var playlistState = {
          list: playlist.playlist,
          isPlaying: data.isPlaying,
          nowPlaying: playlist.nowPlaying,
          time: data.time
        };

        // Send state to clients
        playlistNSP.to(socket.rooms[0]).emit('playlist-state', playlistState);

        // Save state to database
        if (typeof data.time === 'number') {
          playlist.time = data.time;
        }
        playlist.isPlaying = data.isPlaying;
        playlist.save().catch(handleError);

      });
    });


    /*==========================================================================
    transport
    ---------
    Change the current time of the song that is playing
    time in milliseconds
    ==========================================================================*/
    socket.on('transport', function (data) {
      getPlaylist(socket).then(function(playlist){

        playlistNSP.to(socket.rooms[0]).emit('user-action', {
          username: socket.username,
          action: 'transport'
        });

        //======================================================================
        //                          Validate Data
        //======================================================================

        if (!playlist) {
          return socket.emit('playlist-error', {
            success: false,
            message: 'Playlist not found.'
          });
        }
        if (typeof data.time !== 'number' || data.time < 0) {
          return socket.emit('playlist-error', {
            success: false,
            message: 'Invalid time sent.'
          });
        }
        //======================================================================
        //                          Perform Action
        //======================================================================

        // Create playlist state
        var playlistState = {
          list: playlist.playlist,
          isPlaying: playlist.isPlaying,
          nowPlaying: playlist.nowPlaying,
          time: data.time
        };


        // Send state to clients
        playlistNSP.to(socket.rooms[0]).emit('playlist-state', playlistState);

        // Save state to database
        playlist.time = time;
        playlist.save().catch(handleError);


      });
    });


    /*==========================================================================
    move
    ----
    Move a song to a new spot in the playlist or out of the list if
    fromTo.to is -1
    ==========================================================================*/
    socket.on('move', function (data) {
      var fromTo = data.fromTo;
      getPlaylist(socket).then(function(playlist){

        playlistNSP.to(socket.rooms[0]).emit('user-action', {
          username: socket.username,
          action: 'move'
        });
        //======================================================================
        //                          Validate Data
        //======================================================================

        if (!playlist) {
          return socket.emit('playlist-error', {
            success: false,
            message: 'Playlist not found.'
          });
        }

        if (typeof fromTo.from !== 'number' ||
          typeof fromTo.to != 'number' ||
          fromTo.from < 0
          ) {
          return socket.emit('playlist-error', {
            success: false,
            message: 'Incorrect data provided to move song'
          });
        }
        if (fromTo.from > playlist.length || fromTo.to > playlist.length) {
          return socket.emit('playlist-error', {
            success: false,
            message: 'Value too large to move song.'
          });
        }
        //======================================================================
        //                          Perform Action
        //======================================================================

        // Perform array modification
        var songToMove = playlist.playlist[fromTo.from];

        // Perform remove if fromTo.from is a valid index
        if (fromTo.from > -1) {
          playlist.playlist.splice(fromTo.from, 1);
        }
        // Perform insert
        if (fromTo.to > -1) {
          // Insert song
          playlist.playlist.splice(fromTo.to, 0, songToMove);
        }

        var newNowPlaying = playlist.nowPlaying;

        // Algorithm to find now now playing index
        if (newNowPlaying === fromTo.from) {
          newNowPlaying = fromTo.to;
        } else {
          if (newNowPlaying > fromTo.from) {
            newNowPlaying -= 1;
          }

          if (fromTo.to >= 0 && newNowPlaying >= fromTo.to) {
            newNowPlaying += 1;
          }
        }

        playlist.nowPlaying = newNowPlaying;

        var playlistState = {
          list: playlist.playlist,
          nowPlaying: newNowPlaying
        };

        playlistNSP.to(socket.rooms[0]).emit('playlist-state', playlistState);

        playlist.save().catch(handleError);
      });
    });



    /*==========================================================================
    change
    ------
    Change the song to the one in the list at the given songIndex
    ==========================================================================*/
    socket.on('change', function (data) {
      getPlaylist(socket).then(function(playlist){

        playlistNSP.to(socket.rooms[0]).emit('user-action', {
          username: socket.username,
          action: 'change'
        });
        //======================================================================
        //                          Validate Data
        //======================================================================

        if (!playlist) {
          return socket.emit('playlist-error', {
            success: false,
            message: 'Playlist not found.'
          });
        }

        if (typeof data.songIndex !== 'number') {
          return socket.emit('playlist-error', {
            success: false,
            message: 'Must provide a song index.'
          });
        }

        if (data.songIndex < 0) {
          return socket.emit('playlist-error', {
            success: false,
            message: 'Song index too low.'
          });
        }
        if (data.songIndex >= playlist.playlist.length) {
          return socket.emit('playlist-error', {
            success: false,
            message: 'Song index too high.'
          });
        }

        if (data.relative && playlist.nowPlaying - data.songIndex < 0) {
          return socket.emit('playlist-error', {
            success: false,
            message: 'Change invalid, switching to a song number that is too low.'
          });
        }
        //======================================================================
        //                          Perform Action
        //======================================================================

        // Find what the new song index will be
        var newSongIndex;
        if(data.relative){
          newSongIndex = playlist.nowPlaying + data.songIndex;
        } else {
          newSongIndex = data.songIndex;
        }

        // Generate state to send out to clients
        var playlistState = {
          list: playlist.playlist,
          isPlaying: typeof data.isPlaying === 'boolean' ?
          data.isPlaying :
          playlist.isPlaying,

          nowPlaying: newSongIndex,
          time: 0
        };

        // Send state out to clients
        playlistNSP.to(socket.rooms[0]).emit('playlist-state', playlistState);

        // Save changes in database
        playlist.nowPlaying = newSongIndex;
        playlist.time = 0;
        playlist.save().catch(handleError);
      });

    });



    next();
  });

  playlistNSP.on('connection', function (socket) {
    socket.emit('playlist-connect', 'testing');
  });
};

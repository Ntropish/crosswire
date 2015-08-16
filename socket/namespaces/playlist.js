var mongoose = require('mongoose');
var Playlist = mongoose.model('Playlist');
var ioWildcard = require('../socketio-pre-event');

module.exports = function(io) {
  'use strict';
  // Promise returning function to check if user has some permission
  var authorize = function authorize(playlist, user, permission) {
    // Anybody is authorized
    if (playlist[permission] === 0) {
      return Promise.resolve(true);
    }
    // Only friends are authorized
    else if (playlist[permission] === 1) {
      if (playlist.owner === user.username) {
        return Promise.resolve(true);
      }
      return User.findOne({username: playlist.owner}).exec().then(function (owner) {
        if (owner) {
          if (owner.friends.indexOf(user._id) !== -1) {
            return true;
          } else {
            return false;
          }
        } else {
          return Promise.reject('owner of playlist not found');
          // Only the owner is authorized
        }
      }, handleError);
    }
    else if (playlist[permission] === 2) {
      if (playlist.owner === user.username) {
        return Promise.resolve(true);
      }
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

  var handleError = function handleError(err){throw err;};

  // Session namespace for playlists, rooms are joined with names of playlist owners
  // To join Doug's room join the 'Doug' room in this namespace
  var playlistNSP = io.of('playlist');

  // Override onevent to allow wildcard events
  playlistNSP.use(ioWildcard());

  // Define event handlers
  playlistNSP.use(function (socket, next) {

    // Add wildcard event as JWT middleware
    require('../authenticate-token.js')(socket);

    // Event to leave all rooms and join the one given if authorized
    socket.on('join', function (data) {

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
          return User.findOne(
            {username: resolvedPayload.username}
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
          return Playlist.getOne({owner: data.room}).exec()
          .then(function(playlist){
            if (playlist) {
              // Existing playlist was found so return it
              results.playlist = playlist;
              return Promise.resolve();
            } else if(user.username === playlist.owner) {
              // Create playlist if user is trying to join their own room
              // and it is non existent.
              Playlist.create(
                {owner: socket.request.user.username},
                function (err, newPlaylist) {
                  if (err) {
                    throw err;
                  }
                  results.playlist = newPlaylist;
                  return Promise.resolve();
                });
              }
              return Promise.reject('No Playlist available.');
            });
          },
          // Join playlist
          function(playlist) {
            // Store playlist for sending info in the final resolve
            results.playlist = playlist;
            socket.rooms.forEach(function(room){
              socket.leave(room);
            });
            socket.join(room);
          }
        ]
        // Final resolve
        .reduce(function(previous, returnPromise) {
          return previous.then(returnPromise);
        }, Promise.resolve())
        .then(function () {
          var playlistReport = {
            list: results.playlist.playlist,
            isPlaying: results.playlist.isPlaying,
            nowPlaying: results.playlist.nowPlaying,
            time: results.playlist.time,
            addPermission: authorize(
              results.playlist,
              results.user,
              'addPermission')
            };
            socket.emit('join-response',
            {success: true, playlistReport: playlistReport}
          );
            socket.emit('playlist-state', playlistReport);
        }, function (reason) {
          socket.emit('join-response',
          {success: false, message: reason}
        );
      });
    });

    /*==========================================================================
    add
    ---
    Add song to playlist, song should be a url
    ==========================================================================*/
    socket.on('add', function (data) {
      getSession(socket).then(function(playlist){
        //======================================================================
        //                          Validate Data
        //======================================================================
        if (typeof data.song !== 'string') {
          return socket.emit('playlist-error', {
            success: false,
            message: 'Invalid url sent.'
          });
        }

        //======================================================================
        //                          Perform Action
        //======================================================================

        authorize(playlist, socket.request.user, 'addPermission')
          .then(function(isAuthorized){
          if (isAuthorized) {

            //Add url to playlist document
            playlist.playlist.push({url: data.song, time: 0});

            // Create state to send to client
            var playlistState = {
              list: playlist.playlist,
              isPlaying: playlist.isPlaying,
              nowPlaying: playlist.nowPlaying
            };

            // Send state to client
            playlistNSP.to(socket.rooms[0]).emit('playlist-state', playlistState);

            // Save playlist document
            playlist.save().catch(handleError);
          } else {
            socket.emit('playlist-error', {message: 'Not authorized to add song'});
          }
        }, handleError);
      }, handleError);

    });

    /*==========================================================================
    play-pause
    ----------
    Change the isPlaying boolean, play/true pause/false.
    This action updates the time, send in data.time
    ==========================================================================*/
    socket.on('play-pause', function (data) {
      getSession(socket).then(function(playlist){
        //======================================================================
        //                          Validate Data
        //======================================================================

        if (typeof data.isPlaying !== 'boolean' ||
          typeof data.time !== 'number') {
          socket.emit('playlist-error', {
            success: false,
            message: 'Invalid data sent.'
          });
        }

        //======================================================================
        //                          Perform Action
        //======================================================================

        // Construct state
        var playlistState = {
          list: results.playlist.playlist,
          isPlaying: data.isPlaying,
          nowPlaying: results.playlist.nowPlaying,
          time: data.time
        };

        // Send state to clients
        playlistNSP.to(socket.rooms[0]).emit('playlist-state', playlistState);

        // Save state to database
        playlist.time = data.time;
        playlist.isPlaying = isPlaying;
        playlist.save().catch(handleError);

      });
    });


    /*==========================================================================
    transport
    ---------
    Change the current time of the song that is playing
    1 = 1 second, 0.5 = 1/2 second, 100 = 1 min 40 sec, etc.
    ==========================================================================*/
    socket.on('transport', function (data) {
      getSession(socket).then(function(playlist){
        //======================================================================
        //                          Validate Data
        //======================================================================

        if (typeof data.time !== 'number' || time <= 0) {
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
          list: results.playlist.playlist,
          isPlaying: results.playlist.isPlaying,
          nowPlaying: results.playlist.nowPlaying,
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
    move event
    ----------
    Move a song to a new spot in the playlist or out of the list if
    fromTo.to is -1
    ==========================================================================*/
    socket.on('move', function (data) {
      var fromTo = data.fromTo;
      getPlaylist(socket).then(function(playlist){
        //======================================================================
        //                          Validate Data
        //======================================================================
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
            message: 'Values are too large to move song.'
          });
        }
        //======================================================================
        //                          Perform Action
        //======================================================================

        // Perform array modification
        var songToMove = playlist.playlist[fromTo];

        // Perform remove if fromTo.to is a valid index
        if (fromTo.to > -1) {
          playlist.playlist.splice(fromTo.to, 0, removedSong);
        }
        // Perform insert
        if (fromTo.to > -1 && fromTo.to <= fromTo.from) {
          // If remove was performed below the insert, modify insert location
          playlist.playlist.splice(fromTo.from - 1, 1);
        } else {
          // Else, insert as normal
          playlist.playlist.splice(fromTo.from, 1);
        }

        var playlistState = {
          list: results.playlist.playlist,
          isPlaying: results.playlist.isPlaying,
          nowPlaying: results.playlist.nowPlaying
        };

        playlistNSP.to(socket.rooms[0]).emit('move', fromTo);

        playlist.save().catch(handleError);
      });
    });



    /*==========================================================================
    change event
    ------------
    Change the song to the one in the list at the given songIndex
    ==========================================================================*/
    socket.on('change', function (data) {
      getSession(socket).then(function(playlist){
        //======================================================================
        //                          Validate Data
        //======================================================================
        if (!data.songIndex) {
          return socket.emit('playlist-error', {
            success: false,
            message: 'Must provide a song index.'
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
          newSongIndex = playlist.nowPlaying + songIndex;
        } else {
          newSongIndex = songIndex;
        }

        // Generate state to send out to clients
        var playlistState = {
          list: results.playlist.playlist,
          isPlaying: results.playlist.isPlaying,
          nowPlaying: results.playlist.nowPlaying,
          time: results.playlist.time
        };

        // Send state out to clients
        playlistNSP.to(socket.rooms[0]).emit('playlist-state', {
          playlistState: playlistState
        });

        // Save changes in database
        playlist.nowPlaying = newSongIndex;
        playlist.save().catch(handleError);
      });

    });



    next();
  });

  playlistNSP.on('connection', function (socket) {
    //console.log(socket.request.user);
  });
};

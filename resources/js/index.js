$(document).ready(function(){

});

angular.module('index', [])
  .controller('SongShareCtrl', ['$scope', function($scope){
    $scope.token = null;

    $scope.list = {};
    $scope.isPlaying = false;
    $scope.nowPlaying = -1;
    $scope.time = 0;
    $scope.addPermission = false;

    // Object to hold user actions, interface event handlers
    var actions = $scope.actions = {};

    var userSocket = io.connect('https://localhost:3000/user');
    var playlistSocket = io.connect('https://localhost:3000/playlist');

    var pauseSong = function pauseSong() {
      console.log('pause');
    };

    var playSong = function playSong() {
      console.log('play');
    };

    var loadSong = function loadSong(url) {
      console.log('load:', url);
    };

    playlistSocket.on('playlist-state', function(playlistState){

      // Synchronize the currently playing song=================================
      if (playlistState.nowPlaying) {
        // First check if changing index changes the song

        // If a new list was included take it into consideration
        if (playlistState.list) {
          if (playlistState.list[playlistState].url !==
            $scope.list[$scope.nowPlaying].url) {
              // New url dosn't match old url so load the new song
            loadSong(playlistState.list[playlistState].url);
          }
        }
        else {
          if (playlistState.nowPlaying !== $scope.nowPlaying) {
            // List didn't change, but index did. Load new song
            loadSong($scope.list[playlistState.nowPlaying].url);
          }
        }

        // Finally, update nowPlaying index
        $scope.nowPlaying = playlistState.nowPlaying;
      }


      // synchronize list=======================================================
      if (playlistState.list) {

        if (playlistState.nowPlaying === undefined) {
          // Song change was only handled above if playlistState.nowPlaying
          // existed, handle case here where it doesn't exist
          if (playlistState.list[$scope.nowPlaying].url !==
            $scope.list[$scope.nowPlaying].url ) {
              // Song url changed, load the new song
              loadSong($scope.list[$scope.nowPlaying].url);
            }
        }
        $scope.list = list;
      }


      // Sync play/pause state==================================================
      if (typeof playlist.isPlaying === 'boolean') {
        if (playlist.isPlaying && !$scope.isPlaying) {
          playSong();
        }
        else if (!playlistState.isPlaying && $scope.isPlaying) {
          pauseSong();
        }
      }


      // Synchronize add permission for this client=============================
      $scope.addPermission = playlistState.addPermission;


    });


    // DEFINE USER ACTIONS
    actions.join = function join(room) {
      var data = {token: $scope.token, room: room};
      playlistSocket.emit('join', data);
    };

    actions.add = function add(url) {
      var data = {token: $scope.token, url: url};
      playlistSocket.emit('add', data);
    };

    actions.playPause = function playPause(isPlaying) {
      var data = {token: $scope.token, isPlaying: isPlaying};
      playlistSocket.emit('play-pause', data);
    };

    actions.transport = function transport(time) {
      var data = {token: $scope.token, time: time};
      playlistSocket.emit('transport', data);
    };

    actions.move = function move(from, to) {
      var data = {token: $scope.token, fromTo: {from: from, to: to}};
      playlistSocket.emit('move', data);
    };

    actions.change = function change(index) {
      var data = {token: $scope.token, songIndex: index};
      playlistSocket.emit('change', data);
    };


  }]);

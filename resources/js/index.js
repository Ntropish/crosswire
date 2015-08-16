$(document).ready(function(){

});

angular.module('index', [])
  .controller('SongShareCtrl', ['$scope', function($scope){
    $scope.playlist = {};
    $scope.isPlaying = false;
    $scope.nowPlaying = -1;
    $scope.time = 0;

    var userSocket = io.connect('https://localhost:3000/user');
    var playlistSocket = io.connect('https://localhost:3000/playlist');

    playlistSocket.on('playllist-state', function(playlistState){
      if (playlist.list) {
        
      }
    });
  }]);

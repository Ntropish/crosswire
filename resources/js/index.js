$(document).ready(function(){
});

angular.module('index', [])
  .controller('SongShareCtrl', ['$scope', function($scope){
    // User variables
    $scope.username = '';
    $scope.password = '';
    $scope.confirmPassword = '';
    $scope.friendName = '';
    $scope.token = null;
    $scope.loggedInUsername = '';
    $scope.activeTab = 0;
    $scope.showUserBox = false;

    // Playlist variables
    $scope.urlToAdd = '';
    $scope.desiredRoom = '';
    $scope.room = '';
    $scope.list = {};
    $scope.isPlaying = false;
    $scope.nowPlaying = -1;
    $scope.time = 0;
    $scope.addPermission = false;
    $scope.currentSong = '';
    $scope.currentSongDomain = '';

    // Object to hold user actions, interface event handlers
    var actions = $scope.actions = {};

    var userSocket = io.connect('https://localhost:3000/user');
    var playlistSocket = io.connect('https://localhost:3000/playlist');

    var timeRequestIgnore = false;
    var firstPlay = true;

    var host2widgetBaseUrl = {
      "wt.soundcloud.dev" : "wt.soundcloud.dev:9200/",
      "wt.soundcloud.com" : "wt.soundcloud.com/player/",
      "w.soundcloud.com"  : "w.soundcloud.com/player/"
    };
    var songIframe = document.querySelector('#SCwidget');
    var SCwidget = SC.Widget(songIframe);

    // Bind SoundCloud events
    SCwidget.bind(SC.Widget.Events.READY, function(){
    });

    SCwidget.bind(SC.Widget.Events.PLAY, function(data){

      // First play will not have synced time, correct it here
      if (firstPlay) {
        SCcorrectTime();
        firstPlay = false;
      }

      // Check if event needs to be sent
      if (!$scope.isPlaying) {

        // Send play event
        var sendData = {
          token: $scope.token,
          isPlaying: true
        };

        playlistSocket.emit('play-pause', sendData);
      }
    });

    SCwidget.bind(SC.Widget.Events.PAUSE, function(data){

      // CHeck if event needs to be sent
      if ($scope.isPlaying) {

        // Send pause event
        var sendData = {
          token: $scope.token,
          isPlaying: false,
          time: data.currentPosition
        };

        playlistSocket.emit('play-pause', sendData);
      }
    });

    SCwidget.bind(SC.Widget.Events.PLAY_PROGRESS, function(data){
      console.log('====play progress event');

    });

    SCwidget.bind(SC.Widget.Events.SEEK, function(data){
      // Send current position on a transport event
      var sendData = {token: $scope.token, time: data.currentPosition};
      playlistSocket.emit('transport', sendData);
    });

    SCwidget.bind(SC.Widget.Events.FINISH, function(data){
      // If not the last song, skip to the next
      if ($scope.nowPlaying < $scope.list.length -1) {
        var sendData = {token: $scope.token, songIndex: $scope.nowPlaying + 1, isPlaying: true};
        playlistSocket.emit('change', sendData);
      }
    });

    var displayMessage = function displayMessage(msg) {
      console.log(msg);
    };

    var SCcorrectTime = function currectTime() {
      // Seek SoundCloud widget to current time if difference is > 1 second
      SCwidget.getPosition(function(position){
        console.log('looking to correct time', position, 'to', $scope.time);
        if (Math.abs(position - $scope.time) > 1000) {
          console.log('correcting to', $scope.time);
          SCwidget.seekTo($scope.time);
        }
      });
    };

    var updateSongInWidget = function updateSongInWidget() {

      if ($scope.nowPlaying < 0 || $scope.list.length <= 0){
        // Do not load on uninitialized or empty playlist
        $scope.currentSong = null;
        return;
      }
      var newSong = $scope.list[$scope.nowPlaying];

      // If there is no current song but there is a new one,
      // or songs are different, process new url
      if ((!$scope.currentSong && newSong) ||
        $scope.currentSong._id !== newSong._id) {
        // URL has changed, begin processing new URL

        // Define valid domains
        // SoundCloud
        var SCdomains = [
          'soundcloud.com',
          'www.soundcloud.com',
          'w.soundcloud.com'
        ];
        // Youtube
        var YTdomains = [];

        var domain = newSong.url.split('/')[2];
        console.log('domain:', domain);

        // Check if domain is in the valid domain
        // lists and set current song domain
        var isValidDomain = false;
        if( SCdomains.indexOf(domain) !== -1 ) {
          isValidDomain = true;
          $scope.currentSongDomain = 'soundcloud';
        }
        else if( YTdomains.indexOf(domain) !== -1) {
          isValidDomain = true;
          $scope.currentSongDomain = 'youtube';
        }

        // Handle case of invalid domain
        if (!isValidDomain) {
          displayMessage('Invalid song, removing.');
          actions.remove($scope.nowPlaying);
        }

        $scope.currentSong = newSong;
        loadSong();
      }
    };

    var loadSong = function loadSong() {

      var loadSC = function loadSong() {

        var options = {
          visual: true,
          show_artwork: true,
          auto_play: $scope.isPlaying
          /*
          callback: function() {
            SCwidget.play();
              setTimeout(function() {

                SCwidget.seekTo($scope.time);
                if (!$scope.isPlaying) {
                  SCwidget.pause();
                }
              }, 1000);

          }
          */
        };

        var songUrl = $scope.currentSong.url;

        SCwidget.load(songUrl, options);

      };

      if ($scope.currentSongDomain === 'soundcloud') {
        loadSC();

      }
    };

    var fixWidgetDiscrepancies = function fixWidgetDiscrepancies() {
      if ($scope.currentSongDomain === 'soundcloud') {

        // Match play/pause states
        SCwidget.isPaused(function(isPaused){

          // If widget is paused put playlist state isn't, play widget
          if (isPaused && $scope.isPlaying) {
            SCwidget.play();
            SCcorrectTime();
          }

          // If widget is playing but playlist state isn't, pause widget
          else if (!isPaused && !$scope.isPlaying) {
            SCcorrectTime();
            SCwidget.pause();
          }

          else if (!isPaused) {
            SCcorrectTime();
          }
        });
      }
    };

    playlistSocket.on('time-request', function(){
      console.log('GOT TIME REQUEST');

      // Use ignore request condition
      if (timeRequestIgnore) {
        return;
      }

      if ($scope.currentSongDomain === 'soundcloud') {
        SCwidget.getPosition(function(position){
          console.log('sending time response:');
          console.log(position);
          playlistSocket.emit('time-response', {time: position});
        });
      }
    });

    playlistSocket.on('join-response', function(data) {
      if (data.success) {
        $scope.room = data.room;

        // Ignore time requests when first joining
        timeRequestIgnore = true;

        // Make request for current time
        playlistSocket.emit('time-request');

        // Listen for time requests after 2 seconds
        window.setTimeout(function(){
          timeRequestIgnore = false;
        }, 2000);
      }
      else {
        displayMessage('Message:');
        displayMessage(data.message);
      }
    });

    playlistSocket.on('playlist-error', function(error){
      console.log(error);
    });

    playlistSocket.on('playlist-state', function(playlistState){
      console.log('State:');
      console.log(playlistState);
      // Synchronize nowPlaying=================================================
      if (typeof playlistState.nowPlaying === 'number' &&
      playlistState.nowPlaying >= 0) {
        // Update nowPlaying index
        $scope.nowPlaying = playlistState.nowPlaying;
      }

      // synchronize list=======================================================
      if (playlistState.list) {
        $scope.list = playlistState.list;
      }

      // Synchronize add permission for this client=============================
      if (typeof playlistState.addPermission === 'boolean') {
        $scope.addPermission = playlistState.addPermission;
      }

      // If the playlist has shrunk too much, move nowPlaying down to the last song
      if ($scope.nowPlaying >= $scope.list.length) {
        $scope.nowPlaying = $scope.list.length - 1;
        // Case where list.length = 0,
        // making nowPlaying = -1 is handled by updateSong()
      }

      // Sync time==============================================================
      if (typeof playlistState.time === 'number') {
        $scope.time = playlistState.time;
      }

      // Sync play/pause state==================================================

      if (typeof playlistState.isPlaying === 'boolean') {

        if (playlistState.isPlaying && !$scope.isPlaying) {
          $scope.isPlaying = playlistState.isPlaying;
        }
        else if (!playlistState.isPlaying && $scope.isPlaying) {
          $scope.isPlaying = playlistState.isPlaying;
        }
      }

      // Update $scope.currentSong and load new song if it changed
      updateSongInWidget();

      // Update widget to math state
      fixWidgetDiscrepancies();

      // Have angular update the view with the new state
      $scope.$apply();

    });

    userSocket.on('authenticate-result', function(data){
      if (data.token) {
        console.log('token recieved');
        $scope.token = data.token;
      }
      if (data.username) {
        $scope.loggedInUsername = data.username;
      }
      if (data.message) {
        console.log(data.message);
      }

      $scope.$apply();
    });

    // DEFINE USER ACTIONS
    actions.join = function join(room) {
      var sendData = {token: $scope.token, room: room};
      playlistSocket.emit('join', sendData);
    };

    actions.add = function add(url) {
      var sendData = {token: $scope.token, url: url};
      playlistSocket.emit('add', sendData);
    };

    actions.remove = function remove(index) {
      // Use the move action to move the song out of the playlist
      console.log('removing:', index);
      var sendData = {token: $scope.token, fromTo: {from: index, to: -1}};
      playlistSocket.emit('move', sendData);
    };

    actions.playPause = function playPause(isPlaying, time) {
      if ($scope.currentSongDomain === 'soundcloud') {

        SCwidget.isPaused(function(widgetIsPaused){

          if (isPlaying !== widgetIsPaused) {
            // Send no event if pause state is already the same
            return;
          }

          var sendData = {
            token: $scope.token,
            isPlaying: isPlaying
          };

          // If this is a pause event, send the widget's current time
          if (!isPlaying) {
            if ($scope.currentSongDomain === 'soundcloud') {
              SCwidget.getPosition(function(position){
                sendData.time = position;
                playlistSocket.emit('play-pause', sendData);
              });
            }
          } else {
            playlistSocket.emit('play-pause', sendData);
          }
        });

      }
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

    actions.login = function login(username, password) {
      var data = {token: $scope.token, username: username, password: password};
      userSocket.emit('authenticate', data);
    };

    actions.addFriend = function addFriend(name) {
      var data = {token: $scope.token, friendToBe: $scope.friendName };
      userSocket.emit('add-friend', data);
    };

  }]);

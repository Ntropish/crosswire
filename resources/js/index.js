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
    $scope.activeUserTab = 0;
    $scope.showUserBox = false;
    $scope.friends = [];

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
    $scope.volume = 50;
    $scope.userlist = [];

    $scope.permissions = {join: -1, add: -1, modify: -1};

    $scope.scrollConsoleTitle = false;
    $scope.showAlert = false;
    $scope.alertTimeouts = [];


    // Handle song drag and drop
    document.addEventListener('dragstart', function(event){
      var dragged = event.target;
      dragged.style.opacity = 0.5;
      event.dataTransfer.setData("fromIndex", $(event.target).attr('data-index'));
    });

    document.addEventListener('dragend', function(event){
      var dragged = event.target;
      dragged.style.opacity = '';
    });

    document.addEventListener('drop', function(event){
      var song = $(event.target).closest('.song-item');
      var fromIndex = event.dataTransfer.getData('fromIndex');
      var toIndex = $(song).attr('data-index');
      actions.move(+fromIndex, +toIndex);
    });


    // Song title overflow management
    var consoleTitle = $('#current-song-title');
    var consoleTitleHeader = $('#current-song-title>span');

    var updateTitleScroll = function updateTitleScroll() {
      if (consoleTitle.width() < consoleTitleHeader.width()) {
        $scope.scrollConsoleTitle = true;
      }
      else {
        $scope.scrollConsoleTitle = false;
      }
    };

    consoleTitle.bind('DOMSubtreeModified', function(){
      updateTitleScroll();
    });

    $( window ).resize(function(){
        updateTitleScroll();
        $scope.$apply();
    });


    // Object to hold user actions, interface event handlers
    var actions = $scope.actions = {};

    // Connect to sockets
    var conditionalColon = window.location.port ? ':' : '' ;
    var userSocket = io.connect(conditionalColon+window.location.port+'/user');
    var playlistSocket = io.connect(conditionalColon+window.location.port+'/playlist');

    // Flags

    //TODO: This flag is to be removed
    $scope.flashYouButton = true;
    // This is set when first joining a room, time will be innacurate and
    // most likely the request came from this client anyways so ignore it
    var timeRequestIgnore = false;
    // This flag lets the client know the first time the user plays a song
    // upon joining a room so that a time correction is performed.
    // This corrects problems with joining a room where the song is
    // paused. An unplayed soundcloud widget cannot adjust the time so
    // it must correct it upon first play
    var firstPlay = true;
    // This flag is checked when a playlist-state event updates the time so that
    // time updates (calling SCcorrectTime function) can rely on this condition
    var timeUpdated = false;
    // This flag is set upon SC widget FINISH event to ignore seek event
    // caused by the end of the song
    var ignoreSongEndingSeek = false;

    // DOM element that shows messages to the user
    var alertBox = $('#alert-box');

    //==========================================================================
    // INITIALIZE SoundCLoud SDK AND WIDGET
    //==========================================================================

    var songIframe = document.querySelector('#SCwidget');
    var SCwidget = SC.Widget(songIframe);
    SC.initialize({client_id: '4d31f97b23c646bc260647f88f7ed08e'});

    // Bind SoundCloud events
    SCwidget.bind(SC.Widget.Events.READY, function(){
    });

    SCwidget.bind(SC.Widget.Events.PLAY, function(data){

      actions.updateVolume();

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

        SCwidget.getDuration(function(duration){
          if (data.currentPosition - 5 >= duration) {
            // This condition ignores pauses upon song ending
            return;
          }

          // Send pause event
          var sendData = {
            token: $scope.token,
            isPlaying: false,
            time: data.currentPosition
          };

          playlistSocket.emit('play-pause', sendData);
        });
      }
    });

    SCwidget.bind(SC.Widget.Events.SEEK, function(data){
      // Send current position on a transport event

      // Ignore seeking to start of the song
      // This case should only happen when caused by the widget
      // at song end, so ignore it
      if (data.relativePosition === 0 && data.currentPosition === 0) {
        return;
      }

      SCwidget.getPosition(function(position){
        // Don't send time if already synced within a second
        if (Math.abs(position - $scope.time) < 1000) {
          return;
        }

        var sendData = {token: $scope.token, time: data.currentPosition};
        playlistSocket.emit('transport', sendData);

      });


    });

    SCwidget.bind(SC.Widget.Events.FINISH, function(data){
      // If not the last song, skip to the next
      // Make the data to send, THEN validate the song is at the end
      // before sending to avoid duplicate forward skips upon song end.

      if ($scope.nowPlaying >= $scope.list.length - 1) {
        return;
      }
      if ($scope.currentSongDomain === 'soundcloud' &&
        $scope.nowPlaying > SCwidget.nowPlaying) {
          // Do nothing if a new song has alrady been loaded
          return;
        }

      var sendData = {token: $scope.token, songIndex: $scope.nowPlaying + 1, isPlaying: true};

      playlistSocket.emit('change', sendData);


    });

    //==========================================================================
    // MISC APPLICATION FUNCTIONS
    //==========================================================================

    var displayMessage = function displayMessage(msg) {

      // Clear previous timeouts that make the alert box disappear
      for (var i = 0, l = $scope.alertTimeouts.length; i < l; i++) {
        window.clearTimeout($scope.alertTimeouts[i]);
      }

      // Change alert box text
      alertBox.text(msg);

      // Hide box for now
      $scope.showAlert = false;

      // Show the alert box in a bit to reset animation
      $scope.alertTimeouts.push(setTimeout(function(){
        $scope.showAlert = true;
        $scope.$apply();
      }, 100));


      // Set timeout to hide alert box
      $scope.alertTimeouts.push(setTimeout(function(){
        $scope.showAlert = false;
        $scope.$apply();
      }, 4000));

      $scope.$apply();

    };

    var validateSongDomain = function getSongDomain(newSong) {
      var SCdomains = [
        'soundcloud.com',
        'www.soundcloud.com',
        'w.soundcloud.com'
      ];
      // Youtube
      var YTdomains = [];

      var domain = newSong.url.split('/')[2];

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

      return isValidDomain;
    };

    var SCcorrectTime = function SCcurrectTime() {
      // Seek SoundCloud widget to current time if difference is > 1 second
      SCwidget.getPosition(function(position){
        if (Math.abs(position - $scope.time) > 1000) {
          SCwidget.seekTo($scope.time);
        }
      });
    };

    var SCgetTitle = function SCgetTitle(songUrl){
        // Return a promise that resolves with a title
        return new Promise(function(resolve, reject){
          SC.get('/resolve', { url: songUrl}, function(track) {
            if (track.kind === 'track') {
              resolve(track.user.username+' - '+track.title);
            } else {
              reject();
            }

          });
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
        // All songs added through the actions.add function should be valid

        // Handle case of invalid domain
        if (!validateSongDomain(newSong)) {
          displayMessage('Invalid song, removing.');
          actions.remove($scope.nowPlaying);
          return;
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
          auto_play: $scope.isPlaying,
          callback: actions.updateVolume
        };

        var songUrl = $scope.currentSong.url;
        SCwidget.nowPlaying = $scope.nowPlaying;
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

          SCcorrectTime();

          // If widget is paused put playlist state isn't, play widget
          if (isPaused && $scope.isPlaying) {
            SCwidget.play();
          }

          // If widget is playing but playlist state isn't, pause widget
          else if (!isPaused && !$scope.isPlaying) {
            SCwidget.pause();
          }

        });

      }
    };

    //==========================================================================
    // SOCKET.IO EVENT HANDLERS
    //==========================================================================

    playlistSocket.on('user-action', function(data){
      console.log('User', data.username, 'attempted', data.action);
    });

    playlistSocket.on('permission-update', function(data){
      if (typeof data.join === 'number') $scope.permissions.join = data.join;
      if (typeof data.add === 'number') $scope.permissions.add = data.add;
      if (typeof data.modify === 'number') $scope.permissions.modify = data.modify;
      $scope.$apply();
    });

    playlistSocket.on('playlist-userlist', function(data){
      $scope.userlist = data.userlist;
      $scope.$apply();
    });

    playlistSocket.on('playlist-connect', function(){
      if ($scope.room) {
        console.log('trying to rejoin');
        actions.join($scope.room);
      }
    });

    playlistSocket.on('playlist-error', function(data){

    });

    playlistSocket.on('time-request', function(){

      // Use ignore request condition
      if (timeRequestIgnore) {
        return;
      }

      if ($scope.currentSongDomain === 'soundcloud') {
        SCwidget.getPosition(function(position){
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

        $scope.$apply();
      }
      else {
        displayMessage('Message:');
        displayMessage(data.message);
      }
    });

    playlistSocket.on('playlist-error', function(data){
      displayMessage(data.message);
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
        timeUpdated = true;
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


      // Reset flag
      timeUpdated = false;

    });

    userSocket.on('authenticate-result', function(data){

      if (data.token) {
        $scope.token = data.token;
      }
      if (data.username) {
        $scope.loggedInUsername = data.username;
      }
      if (data.friends) {
        $scope.friends = data.friends;
      }
      if (data.message) {
        displayMessage(data.message);
      }

      $scope.$apply();
    });

    userSocket.on('register-result', function(data){
      if (!data.success && data.message) {
        displayMessage(data.message);
      }

      if (data.success) {
        actions.login($scope.username, $scope.password);
      }

    });

    userSocket.on('add-friend-response', function(data) {
      if (data.success) {
        $scope.friends.push(data.friend);
        displayMessage(data.message);
      } else {
        displayMessage(data.message);
      }
    });

    userSocket.on('remove-friend-response', function(data) {
      if (data.success) {
        $scope.friends.splice($scope.friends.indexOf(data.friendNoMore), 1);
        displayMessage('Removed friend.');
      } else {
        displayMessage(data.message);
      }
      $scope.$apply();

    });

    //==========================================================================
    // CROSSWIRE INTERFACE ACTIONS
    //==========================================================================

    actions.updatePermissions = function updatePermissions(newPermission) {

      var sendData = {token: $scope.token,
        join: newPermission.join,
        add: newPermission.add,
        modify: newPermission.modify
       };
      playlistSocket.emit('permissions', sendData);
    };

    actions.join = function join(room) {
      var sendData = {token: $scope.token, room: room};
      playlistSocket.emit('join', sendData);
    };

    actions.add = function add(url) {

      // Silently reject blank cases
      if (url === '') {
        return;
      }

      // Immediately remove url from model
      $scope.urlToAdd = '';

      // Otherwise check soundcloud api for validity
      SCgetTitle(url).then(function(title){
        var sendData = {token: $scope.token, url: url, title: title};
        playlistSocket.emit('add', sendData);

      }, function(err) {
        displayMessage('Couldn\'t find that song');
      });

    };

    actions.remove = function remove(index) {
      // Use the move action to move the song out of the playlist
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
            SCwidget.getPosition(function(position){
              sendData.time = position;
              playlistSocket.emit('play-pause', sendData);
            });

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

    actions.move = function move(fromIndex, toIndex) {
      var data = {token: $scope.token, fromTo: {from: fromIndex, to: toIndex}};
      playlistSocket.emit('move', data);
    };

    actions.change = function change(index) {
      var data = {token: $scope.token, songIndex: index};
      playlistSocket.emit('change', data);
    };

    actions.register = function register(username, password) {
      if ($scope.password === $scope.confirmPassword) {
        var data = {token: $scope.token,
          username: username,
          password: password,
          gresponse: grecaptcha.getResponse()
        };
        userSocket.emit('register', data);
        grecaptcha.reset();
      } else {
        displayMessage('Those passwords don\'t match!');
      }

    };

    actions.login = function login(username, password) {
      var data = {token: $scope.token, username: username, password: password};
      userSocket.emit('authenticate', data);
    };

    actions.addFriend = function addFriend(name) {
      var data = {token: $scope.token, friendToBe: name };
      userSocket.emit('add-friend', data);
    };

    actions.removeFriend = function removeFriend(index) {
      var data = {token: $scope.token, friendNoMore: $scope.friends[index] };
      userSocket.emit('remove-friend', data);
    };

    actions.updateVolume = function updateVolume() {
      if ($scope.currentSongDomain === 'soundcloud') {
        SCwidget.setVolume($scope.volume / 100);
      }
    };

    actions.leave = function leave() {
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
      playlistSocket.emit('leave');

      // Update $scope.currentSong and load new song if it changed
      updateSongInWidget();

      // Update widget to math state
      fixWidgetDiscrepancies();

    };

    actions.logout = function logout(){
      playlistSocket.emit('leave');
      $scope.username = '';
      $scope.password = '';
      $scope.confirmPassword = '';
      $scope.friendName = '';
      $scope.token = null;
      $scope.loggedInUsername = '';
      $scope.activeTab = 0;
      $scope.friends = [];

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
      displayMessage("Bye, have fun!");

      // Update $scope.currentSong and load new song if it changed
      updateSongInWidget();

      // Update widget to math state
      fixWidgetDiscrepancies();
    };

  }]);

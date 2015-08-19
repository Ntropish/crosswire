$(document).ready(function(){
  var userSocket = io.connect('https://localhost:3000/user');
  var playlistSocket = io.connect('https://localhost:3000/playlist');
  var token;

  userSocket.on('add-friend-response', function(data) {
    console.log(data);
  });

  userSocket.on('remove-friend-response', function(data) {
    console.log(data);
  });

  userSocket.on('register-result', function(data){
    console.log(data);
  });

  userSocket.on('authenticate-result', function(data){
    console.log(data);
    if (data.success && data.token) {
      $('#token').text(data.token);
      token = data.token;
    }
  });

  $('#register-button').on('click', function(event){
    event.preventDefault();
    if (userSocket) {
      var data = {
        username: $('#register-username').val(),
        password: $('#register-password').val(),
        create: true
      };
      console.log(data);
      userSocket.emit('register', data);
    }
  });

  $('#login-button').on('click', function(event){
    event.preventDefault();
    if (userSocket) {
      var data = {
        username: $('#login-username').val(),
        password: $('#login-password').val()
      };
      console.log(data);
      userSocket.emit('authenticate', data);
    }
  });

  $('#hi').on('click', function(event){
    event.preventDefault();
    userSocket.emit('talk', {msg:'hi', token: token});
  });

  $('#add-friend-button').on('click', function(event){
    event.preventDefault();
    userSocket.emit('add-friend', {
      friendToBe: $('#friend-name').val(),
      token: token
    });
  });


  $('#remove-friend').on('click', function(event){
    event.preventDefault();
    userSocket.emit('remove-friend', {
      friendNoMore: $('#friend-to-remove').val(),
      token: token
    });
  });

});

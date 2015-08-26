/* globals console: false, module: false, require: false, process: false */

module.exports = function (mongoose) {
    'use strict';
    var playlistSchema = mongoose.Schema({
        owner: {type: String, required: true, index: {unique: true}},
        // List of song urls and their saved times
        playlist: [{
            url: {type: String, required: true},
            title: {type: String, required: true}
        }],
        // Play - true, Pause - false
        isPlaying: {type: Boolean, 'default': false, required: true},
        // Index of song playing in playlist
        nowPlaying: {type: Number, 'default': 0, required: true},
        time: Number,
        // 0 - only owner can join, 1 - friends, 2 - anyone
        joinPermission: {type: Number, 'default': 1, required: true},
        // 0 - only owner can add songs, 1 - friends, 2 - anyone
        addPermission: {type: Number, 'default': 1, required: true},
        // 0 - only owner can modify playlist, 1 - friends, 2 - anyone
        modifyPermission: {type: Number, 'default': 1, required: true},
        // Track all users connected
        userlist: [String]

    });
    var Playlist = mongoose.model('Playlist', playlistSchema);

};

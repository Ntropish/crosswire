/* globals console: false, module: false, require: false, process: false */
var bcrypt = require('bcrypt');
var SALT_WORK_FACTOR = 10;

/*
    Connect to mongoose, set up error display

    Log a connection message once connected.
    This message should be removed eventually
 */
module.exports = function(mongoose) {
    'use strict';
    /*
     Define the user schema for the application
     */

    var userSchema = mongoose.Schema({
        username: {type: String, required: true, index: {unique: true}},
        password: {type: String, required: true},
        friends: [{type: mongoose.Schema.ObjectId, ref: 'User'}],
        session: mongoose.Schema.ObjectId,
        volume: Number
    });

    userSchema.pre('save', function (next) {
        var user = this;
        //Check if the password changed and return otherwise so it isn't hashed twice
        if (!user.isModified('password')) {
            return next();
        }
        //TODO: Switch to promises
        bcrypt.genSalt(SALT_WORK_FACTOR, function (err, salt) {
            if (err) {
                return next(err);
            }

            bcrypt.hash(user.password, salt, function (err, hash) {
                if (err) {
                    return next(err);
                }
                user.password = hash;
                next();
            });
        });
    });

    userSchema.methods.verifyPassword = function (passwordToCheck, cb) {
        bcrypt.compare(passwordToCheck, this.password, function (err, isMatch) {
            if (err) {
                return cb(err);
            }
            cb(null, isMatch); 
        });
    };

    userSchema.methods.addFriend = function (newFriend) {
        // Add a friend to this' friend list based on an ObjectId
        if (this.friends.indexOf(newFriend) === -1) {
            this.friends.push(newFriend);
            return this.save();
        }
        return Promise.resolve('friend already exists in friend list');
    };

    userSchema.methods.removeFriend = function (friendNoMore) {
        // Remove a friend from this' friend list based on an ObjectId
        var index = this.friends.indexOf(friendNoMore);
        if (index !== -1) {
            this.friends.splice(index, 1);
            return this.save();
        }
        return Promise.resolve('user id not found in friend list');

    };

    userSchema.statics.getIdFromUsername = function (username) {
        // Returns a promise that fulfills with a user id
        return this.findOne({username: username}).exec().then(function (user) {
            return user._id;
        });
    };

// Use the user schema to create the User model
    var User = mongoose.model('User', userSchema);

};

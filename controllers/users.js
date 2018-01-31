const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const userModel = require('../models/user.model');
const config = require('../config');

// Register new users
router.post('/register', function(req, res) {
    if (!req.body.username || !req.body.password) {
        res.json({
            success: false,
            message: 'Please enter username and password.'
        });
    } else {
        let newUser = new userModel({
            username: req.body.username,
            password: req.body.password
        });

        // Attempt to save the user
        newUser.save().then(_ => {
            res.json({
                success: true,
                message: 'Successfully created new user.'
            });
        }).catch(err => {
            return res.json({
                success: false,
                message: 'That username already exists.'
            });
        });
    }
});

router.get('/', function(req, res) {
    userModel.find({}).then((err, users) => {
        res.json(users);
    });
});

// Authenticate the user and get a JSON Web Token to include in the header of future requests.
router.post('/auth', (req, res) => {
    userModel.findOne({
        email: req.body.email
    }).then(user => {
        if (!user) {
            res.send({
                success: false,
                message: 'Authentication failed. User not found.'
            });
        } else {
            // Check if password matches
            user.comparePassword(req.body.password, function(err, isMatch) {
                if (!err && isMatch) {
                    // Create token if the password matched and no error was thrown
                    let token = jwt.sign(user.toJSON(), config.auth.secret, {
                        expiresIn: "2 days"
                    });
                    res.json({
                        success: true,
                        message: 'Authentication successfull',
                        token
                    });
                } else {
                    res.send({
                        success: false,
                        message: 'Authentication failed. Password did not match'
                    });
                }
            });
        }
    }).catch(err => {
        throw err;
    });
});

module.exports = router;
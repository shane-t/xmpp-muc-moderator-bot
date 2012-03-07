/*jslint devel: true, node: true, sloppy: true, nomen: true, maxerr: 50, indent: 4 */

var dutil = require("./src/dutil.js");
var http = require('http');
var querystring = require('querystring');
var fs = require('fs');

/* DEBUG */

var dev = require('http').createServer(dev_handler);
var io = require('socket.io').listen(dev);
dev.listen(54321);

function dev_handler (req, res) {
    fs.readFile(__dirname + '/index.html',
        function (err, data) {
            if (err) {
                res.writeHead(500);
                return res.end('Error loading index.html');
            }

        res.writeHead(200);
        res.end(data);
    });
}

function censor(key, value) {
	try {
		//console.log(key, value);
    		if (key == "connection" || key[0] == "_") {
        		return "(circular)";
    		} else if (key == "msg_log" && value.length > 0) {
			log = [];
			for (var i in value) {
				log.push(Strophe.serialize(value[i]));i
			}
			return log;
    		} else if (typeof(value) == "function") {
        		return "function";
    		} 
    		return value;
	} catch(e) {
		return "error";
	}
}

function dump_state (obj) {
	console.log("state");
	try {
		var state = JSON.parse(JSON.stringify(obj, censor));
		io.sockets.emit('info', { state: state });
	} catch (e) {
		console.log(e);
		io.sockets.emit('info', { error: 'error' });
	}
}

io.sockets.on('connection', function (socket) {
    socket.emit('info', { time: new Date().getTime() });
    socket.on('request', function (data) {
        console.log(data);
    });

    socket.on('eval', function (data) {
	try {
		eval(data.code);
	} catch (e) {
		konsole.log(e);
	}
    });

});

setInterval( function () {
	dump_state(steward);
	console.log("...");
}, 5000);


/* END_DEBUG */





var $ = require('jquery');
var strophe = require("./strophe/strophe.js").Strophe;
var Strophe = strophe.Strophe;
var $iq = strophe.$iq;
var $msg = strophe.$msg;
var $build = strophe.$build;
var $pres = strophe.$pres;
var steward;

function Steward(bosh_url, user, pass, muc_domain) {
    this.connection = new Strophe.Connection(bosh_url);
    this.jid = user;
    this.pass = pass;
    this.muc_domain = muc_domain;
    this.connection.xmlInput = function (xml) {
        console.log(Strophe.serialize(xml));
    };
    this.connection.xmlOutput = function (xml) {
        console.log(Strophe.serialize(xml));
    };

    this.rooms = {};
}

/* DEBUG */

/*
setInterval( function () {
    console.log("...");
}, 5000);
*/


Steward.prototype = {

    pres_handler_ref: null,

    msg_handler_ref: null,


    commands: {
        revoke: function (data) {
            var room_jid = data.room_jid,
                user_jid = data.bare_jid;

            steward.rooms[room_jid].change_role(user_jid, "participant", steward.connection);

        },

        kick: function (data) {
            var room_jid = data.room_jid,
                user_jid = data.bare_jid;
            steward.rooms[room_jid].change_role(user_jid, "none", steward.connection);
        },

        grant: function (data) {
            var room_jid = data.room_jid,
                user_jid = data.bare_jid;
            steward.rooms[room_jid].change_role(user_jid, "moderator", steward.connection);
        },

        change_subject: function (data) {
            var room_jid = data.room_jid,
                subject = data.subject;
            steward.rooms[room_jid].change_subject(subject, steward.connection);
        }


    },

    connection: null,

    jid: null,

    pass: null,

    muc_domain: null,


    msg_handler: function (msg) {

        try {
            console.log("msg_handler()");
            var from = $(msg).attr('from'),

            //is it MUC? I don't care unless its for one of my rooms!//
                room_jid = Strophe.getBareJidFromJid(from);


            if (this.rooms[room_jid]) {
                this.rooms[room_jid].msg_handler(msg);
                return true;
            }
        } catch (e) {
            console.log(e);
        }

        return true;
    },


    pres_handler: function (pres) {
        try {
            console.log("presence_handler()");
            var from = $(pres).attr('from'),

            //is it MUC? I don't care unless its for one of my rooms!//
                room_jid = Strophe.getBareJidFromJid(from);


            if (this.rooms[room_jid]) {
                this.rooms[room_jid].pres_handler(pres);
                return true;
            }


        } catch (e) {
            console.log(e);

        }

        return true;

    },

    create_room: function (room_jid, cb) {
        console.log("create_room: " + room_jid);
        var unique_id = this.connection.getUniqueId();
        this.connection.send($pres({
            to: room_jid + "/steward" + unique_id,
            id: unique_id
        }));

        this.room_cb = cb;

        this.connection.addHandler(this.create_callback.bind(this), null, "presence", null, null, room_jid, {
            matchBare: true
        });
    },

    create_callback: function (pres) {
        try {
            console.log("created");
            //first, have a look for status 201, the room is created
            var x_status = $(pres).find('status'),
                from = $(pres).attr('from'),
                room_jid = Strophe.getBareJidFromJid(from),
                new_room = false;

            if (x_status.length) {
                if (x_status.attr('code') === '201') {
                    new_room = true;
                }
            }

            if (!this.rooms[room_jid]) {
                new_room = true;
            }

            if (new_room) {
                this.rooms[room_jid] = new Room(room_jid, this.connection);
                this.rooms[room_jid].pres_handler(pres);
                this.room_cb(JSON.stringify({
                    room_jid: room_jid
                }));
            }

        } catch (e) {
            console.log(e);
        }
    },

    connect: function () {
        this.connection.connect(this.jid, this.pass, this.connection_callback.bind(this));
    },

    connection_callback: function (status) {
        switch (status) {
        case Strophe.Status.CONNECTING:
            console.log("connecting");
            break;
        case Strophe.Status.CONNECTED:
            console.log("connected");
            this.connected();
            break;
        case Strophe.Status.CONNFAIL:
            console.log("connection failed");
            break;
        case Strophe.Status.DISCONNECTED:
            console.log("disconnected");
            break;
        }
    },


    connected: function () {
        console.log("CONNECTED");
        this.pres_handler_ref = this.connection.addHandler(this.pres_handler.bind(this), null, "presence");
        this.msg_handler_ref = this.connection.addHandler(this.msg_handler.bind(this), null, "message");
        this.connection.send($pres());
    }

};



function Item(affiliation, role) {
    this.affiliation = affiliation;
    this.role = role;
}

Item.prototype = {
    affiliation: null,
    role: null
};


function Resource(occupant_jid, items) {
    this.occupant_jid = occupant_jid;
    this.items = items;
}

Resource.prototype = {

    occupant_jid: null,

    items: [],

    is_owner: function () {
        var i = 0;
        for (i = 0; i < this.items.length; i += 1) {
            if (this.items[i].affiliation === "owner") {
                return true;
            }
        }
        return false;
    },

    is_moderator: function () {
        var i = 0;
        return this.is_owner() ? true : (function (resource) {
            for (i = 0; i < resource.items.length; i += 1) {
                if (resource.items[i].role === "moderator") {
                    return true;
                }
            }
            return false;
        }(this));
    }
};

function User(bare_jid) {
    this.bare_jid = bare_jid;
    this.resources = {};
}

User.prototype = {

    bare_jid: null,

    resources: {},

    is_online: function () {
        var i;
        for (i in this.resources) {
            return true;
        }
        return false;
    },

    is_moderator: function () {
        var i;
        for (i in this.resources) {
            if (this.resources[i].is_moderator()) {
                return true;
            }
        }
        return false;
    },

    get_non_moderator_resources: function () {
        var non_moderator_resources = [],
            i;
        for (i in this.resources) {
            if (!this.resources[i].is_moderator()) {
                non_moderator_resources.push(Strophe.getResourceFromJid(this.resources[i].occupant_jid));
            }
        }
        return non_moderator_resources;
    },



    delete_resource: function (resource, delete_cb) {
        var was_moderator = this.is_moderator();
        delete this.resources[resource];
        return delete_cb(this, this.is_online(), was_moderator);
    },


    add_resource: function (resource, add_cb) {
        this.resources[Strophe.getResourceFromJid(resource.occupant_jid)] = resource;
        return add_cb(this, this.is_moderator());
    }

};

function Room(room_jid, connection) {
    this.room_jid = room_jid;
    this.roster = {};
    this._connection = connection;
    this.counter = 0;
    this.self_destruct_timer = null;

}


Room.prototype = {

    activate_self_destruct: function () {

        console.log("activate_self_destruct():" + this.room_jid);

        //after 120 seconds, delete the room
        this.self_destruct_timer = setTimeout(function () {
            delete steward.rooms[this.room_jid];
        }.bind(this), 120000);

    },

    roster_size: function () {
        var size = 0,
            i;
        for (i in this.roster) {
            if (this.roster.hasOwnProperty(i)) {
                size += 1;
            }
        }
        return size;
    },


    is_moderator: function (jid) {
        var user_jid;
        if (jid) {
            user_jid = jid;
        } else {
            user_jid = steward.jid;
        }

        return this.roster[user_jid].is_moderator();
    },

    config: {
        subject: "MUC room"
    },

    configure: function (config) {
        this.config = config;
    },

    change_subject: function (subject, connection) {
        this._connection.send($msg({
            to: this.room_jid,
            type: "groupchat"
        }).c('subject').t(subject));
        this.config.subject = subject;
        this.send_room_config();
    },

    send_room_config: function () {
        if (this.is_moderator()) {
            this._connection.send(
                $msg({
                    to: this.room_jid,
                    type: "groupchat"
                }).c('config').t(JSON.stringify(this.config))
            );
        }
    },

    pres_handler: function (pres) {
        console.log("pres_handler for " + this.room_jid);

        var x_items = $(pres).find('item'),
            ptype = $(pres).attr('type'),
            from = $(pres).attr('from'),
            items = [],
            i = 0,
            bare_jid = null;


        if (x_items.length) {

            for (i = 0; i < x_items.length; i += 1) {
                items.push(new Item($(x_items[i]).attr('affiliation'), $(x_items[i]).attr('role')));
                bare_jid = Strophe.getBareJidFromJid($(x_items[i]).attr('jid')); //we'll take the last jid, there should only be one
            }

        }

        if (ptype !== "unavailable") {
            //is this a new user, or an existing user?
            var resource = new Resource(from, items),
                user = this.roster[bare_jid];

            if (!user) {
                //someone new
                user = this.add_occupant(new User(bare_jid), function (user) {
                    console.log("occupant added");
                    return user;
                }.bind(this));
                if (typeof this.self_destruct_timer === "number") {
                    clearInterval(this.self_destruct_timer);
                    this.self_destruct_timer = null;
                }

            }

            //either way, add a resource
            user.add_resource(resource, function (resource, moderator) {
                console.log("resource added");
            });

        } else {
            //user is leaving
            if (this.roster[bare_jid]) {
                this.roster[bare_jid].delete_resource(Strophe.getResourceFromJid(from), function (user, online, was_moderator) {
                    if (user && !online) {
                        this.delete_occupant(user.bare_jid);
                    }
                    //third parameter of callback - whether the user who just left was a moderator
                    if (was_moderator) {
                        this.pick_next_moderator();
                    }

                    if (this.roster_size() === 1) {
                        this.activate_self_destruct();
                    }


                }.bind(this));
            }
        }

        var moderator = this.get_moderator();

        if (moderator) {
            var non_moderator_resources = moderator.get_non_moderator_resources();
            for (i = 0; i < non_moderator_resources.length; i += 1) {
                this.change_role_nick(non_moderator_resources[i], "moderator");
            }
        } else {
            this.pick_next_moderator();
        }

        return this;
    },

    msg_handler: function (msg) {
        console.log("msg_handler for " + this.room_jid);
        //TODO the human moderator can issue commands to the bot
        return true;
    },


    pick_next_moderator: function () {
        var i;
        for (i in this.roster) {
            if ((this.roster[i].bare_jid !== steward.jid) && this.roster[i].is_online()) {

                steward.commands.grant({
                    room_jid: this.room_jid,
                    bare_jid: this.roster[i].bare_jid
                });

                return true;
            }
        }
    },

    get_moderator: function () {
        var i;
        for (i in this.roster) {
            if ((this.roster[i].bare_jid !== steward.jid) && this.roster[i].is_moderator()) {
                return this.roster[i];
            }
        }
        return false;
    },

    get_occupant_by_nick: function (nick) {
        var i, j;
        for (i in this.roster) {
            for (j in this.roster[i].resources) {
                if (nick === Strophe.getResourceFromJid(this.roster[i].resources[j].occupant_jid)) {
                    return this.roster[i];
                }
            }
        }
    },

    get_moderator_nicks: function () {
        var nicks = [],
            moderator = this.get_moderator(),
            i;
        for (i in moderator.resources) {
            nicks.push(moderator.resources[i].occupant_jid);
        }
        return nicks;
    },


    add_occupant: function (user, add_cb) {
        this.roster[user.bare_jid] = user;
        return add_cb(this.roster[user.bare_jid]);
    },

    get_occupant: function (bare_jid) {
        return this.roster[bare_jid];
    },

    delete_occupant: function (bare_jid) {
        delete this.roster[bare_jid];
    },


    change_role: function (bare_jid, role, connection) {
        var i;
        for (i in this.roster[bare_jid].resources) {
            var nick = Strophe.getResourceFromJid(this.roster[bare_jid].resources[i].occupant_jid);
            this.change_role_nick(nick, role);
        }

    },

    change_role_nick: function (nick, role) {
        this._connection.sendIQ($iq({
            to: this.room_jid,
            type: "set"
        }).c('query', {
            xmlns: "http://jabber.org/protocol/muc#admin"
        }).c('item', {
            nick: nick,
            role: role
        }), function (iq) {});
    }

};

/*
http.createServer(function (req, res) {
    console.log("roomserv");
    var url = req.url,
        qs = querystring.parse(url);
    res.writeHead(200, 'application/json');

    if (qs.action === "new_room" && qs.node.length > 0) {
        steward.create_room(qs.node + "@" + steward.muc_domain, function (info) {
            res.write(info);
            res.end();
        });
    } else {
        res.end();
    }


}).listen(12345);
*/

exports.steward = steward;

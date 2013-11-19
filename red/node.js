'use strict';

var EventEmitter = require('events').EventEmitter,
    util = require('util');

function Node(options) {
    options = this.options = options || {};
    EventEmitter.call(this);
    this.registry = options.registry || require('./nodes');
    this.id = options.id;
    this.type = options.type;
    this.name = options.name;
    this.wires = options.wires || [];

    this.registry.addNode(this);
}

util.inherits(Node, EventEmitter);

Node.prototype.close = function () {
    // called when a node is removed
    this.emit('close');
};

Node.prototype.send = function (msg) {
    var _this = this;

    if (typeof msg === 'undefined') {
        msg = [];
    } else if (!util.isArray(msg)) {
        msg = [msg];
    }

    for (var i in this.wires) {
        var wires = this.wires[i];
        if (i < msg.length) {
            for (var j in wires) {
                if (typeof msg[i] !== 'undefined') {
                    var msgs = msg[i];
                    if (!util.isArray(msg[i])) {
                        msgs = [msg[i]];
                    }
                    for (var k in msgs) {
                        var mm = msgs[k];
                        var m = {};
                        for (var p in mm) {
                            if (mm.hasOwnProperty(p)) {
                                m[p] = mm[p];
                            }
                        }
                        var node = this.registry.getNode(wires[j]);
                        if (node) {
                            node.receive(m);
                        }
                    }
                }
            }
        }
    }
}

Node.prototype.receive = function (msg) {
    this.emit('input', msg);
};

Node.prototype.log = function (msg) {
    var o = {
        level:'log',
        id:this.id,
        type:this.type,
        msg:msg
    };

    if (this.name) {
        o.name = this.name;
    }
    this.emit('log',o);
};

Node.prototype.warn = function (msg) {
    var o = {
        level:'warn',
        id:this.id,
        type:this.type,
        msg:msg
    };

    if (this.name) {
        o.name = this.name;
    }
    this.emit('log', o);
};

Node.prototype.error = function (msg) {
    var o = {
        level:'error',
        id:this.id,
        type:this.type,
        msg:msg
    };

    if (this.name) {
        o.name = this.name;
    }
    this.emit('log', o);
};

Node.prototype.__rednode__ = true;

module.exports = Node;
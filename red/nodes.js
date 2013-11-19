/**
 * Copyright 2013 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/
var util = require("util"),
    EventEmitter = require("events").EventEmitter,
    fs = require("fs"),
    path = require("path"),
    events = require("./events"),
    Node = require('./node'),
    storage = null;

function getCallerFilename(type) {
    //if (type == "summary") {
    //    var err = new Error();
    //    console.log(err.stack);
    //    return null;
    //}
    // Save original Error.prepareStackTrace
    var origPrepareStackTrace = Error.prepareStackTrace;
    // Override with function that just returns `stack`
    Error.prepareStackTrace = function (_, stack) {
        return stack;
    }
    // Create a new `Error`, which automatically gets `stack`
    var err = new Error();
    // Evaluate `err.stack`, which calls our new `Error.prepareStackTrace`
    var stack = err.stack;
    // Restore original `Error.prepareStackTrace`
    Error.prepareStackTrace = origPrepareStackTrace;
    // Remove superfluous function call on stack
    stack.shift();
    stack.shift();
    return stack[0].getFileName();
}

var registry = (function() {
        var nodes = {};
        var logHandlers = [];
        var obj = {
            add: function(n) {
                nodes[n.id] = n;
                n.on("log",function(msg) {
                    for (var i in logHandlers) {
                        logHandlers[i].emit("log",msg);
                    }
                });
            },
            get: function(i) {
                return nodes[i];
            },
            clear: function() {
                events.emit("nodes-stopping");
                for (var n in nodes) {
                    nodes[n].close();
                }
                events.emit("nodes-stopped");
                nodes = {};
            },
            each: function(cb) {
                for (var n in nodes) {
                    cb(nodes[n]);
                }
            },
            addLogHandler: function(handler) {
                logHandlers.push(handler);
            }
        }
        return obj;
})();

var ConsoleLogHandler = new EventEmitter();
ConsoleLogHandler.on("log",function(msg) {
    util.log("["+msg.level+"] ["+msg.type+":"+(msg.name||msg.id)+"] "+msg.msg);
});

registry.addLogHandler(ConsoleLogHandler);

var node_type_registry = (function() {
        var node_types = {};
        var node_configs = {};
        var obj = {
            register: function(type,node) {
                util.inherits(node, Node);
                var callerFilename = getCallerFilename(type);
                if (callerFilename == null) {
                    util.log("["+type+"] unable to determine filename");
                } else {
                    var configFilename = callerFilename.replace(/\.js$/,".html");
                    if (fs.existsSync(configFilename)) {
                        node_types[type] = node;
                        if (! node_configs[configFilename]) {
                            node_configs[configFilename] = fs.readFileSync(configFilename,'utf8');
                        }
                        events.emit("type-registered",type);
                    } else {
                        util.log("["+type+"] missing template file: "+configFilename);
                    }
                }
            },
            get: function(type) {
                return node_types[type];
            },
            getNodeConfigs: function() {
                var result = "";
                for (var nt in node_configs) {
                    result += node_configs[nt];
                }
                return result;
            }
        }
        return obj;
})();

var credentials = {};

module.exports.addCredentials = function(id,creds) {
    credentials[id] = creds;
    storage.saveCredentials(credentials);
};

module.exports.getCredentials = function(id) {
    return credentials[id];
};

module.exports.deleteCredentials = function(id) {
    delete credentials[id];
    storage.saveCredentials(credentials);
};

module.exports.createNode = function(node, options) {
    Node.call(node, options);
};

module.exports.registerType = node_type_registry.register;
module.exports.getNodeConfigs = node_type_registry.getNodeConfigs;
module.exports.addLogHandler = registry.addLogHandler;

module.exports.load = function(settings) {
    function loadNodes(dir) {
        fs.readdirSync(dir).sort().filter(function(fn){
                var stats = fs.statSync(path.join(dir,fn));
                if (stats.isFile()) {
                    if (/\.js$/.test(fn)) {
                        try {
                            require(path.join(dir,fn));
                        } catch(err) {
                            util.log("["+fn+"] "+err);
                            //console.log(err.stack);
                        }
                    }
                } else if (stats.isDirectory()) {
                    // Ignore /.dirs/ and /lib/
                    if (!/^(\..*|lib|icons)$/.test(fn)) {
                        loadNodes(path.join(dir,fn));
                    } else if (fn === "icons") {
                        events.emit("node-icon-dir",path.join(dir,fn));
                    }
                }
        });
    }
    loadNodes(__dirname+"/../nodes");
    if (settings.nodesDir) {
        loadNodes(settings.nodesDir);
    }
    //events.emit("nodes-loaded");
}

var activeConfig = [];
var missingTypes = [];

events.on('type-registered',function(type) {
        if (missingTypes.length > 0) {
            var i = missingTypes.indexOf(type);
            if (i != -1) {
                missingTypes.splice(i,1);
                util.log("[red] Missing type registered: "+type);
            }
            if (missingTypes.length == 0) {
                parseConfig();
            }
        }
});

module.exports.getNode = function(nid) {
    return registry.get(nid);
};

module.exports.addNode = function (node) {
    return registry.add(node);
};

function stopFlows() {
    if (activeConfig&&activeConfig.length > 0) {
        util.log("[red] Stopping flows");
    }
    registry.clear();
}

module.exports.stopFlows = stopFlows;

module.exports.setConfig = function(conf) {
    stopFlows();
    activeConfig = conf;

    if (!storage) {
        // Do this lazily to ensure the storage provider as been initialised
        storage = require("./storage");
    }
    storage.getCredentials().then(function(creds) {
        credentials = creds;
        parseConfig();
    }).otherwise(function(err) {
        util.log("[red] Error loading credentials : "+err);
    });
}

module.exports.getConfig = function() {
    return activeConfig;
}

var parseConfig = function() {
    missingTypes = [];
    for (var i in activeConfig) {
        var type = activeConfig[i].type;
        // TODO: remove workspace in next release+1
        if (type != "workspace" && type != "tab") {
            var nt = node_type_registry.get(type);
            if (!nt && missingTypes.indexOf(type) == -1) {
                missingTypes.push(type);
            }
        }
    };
    if (missingTypes.length > 0) {
        util.log("[red] Waiting for missing types to be registered:");
        for (var i in missingTypes) {
            util.log("[red]  - "+missingTypes[i]);
        }
        return;
    }

    util.log("[red] Starting flows");
    events.emit("nodes-starting");
    for (var i in activeConfig) {
        var nn = null;
        // TODO: remove workspace in next release+1
        if (activeConfig[i].type != "workspace" && activeConfig[i].type != "tab") {
            var nt = node_type_registry.get(activeConfig[i].type);
            if (nt) {
                try {
                    nn = new nt(activeConfig[i]);
                }
                catch (err) {
                    util.log("[red] "+activeConfig[i].type+" : "+err);
                }
            }
            // console.log(nn);
            if (nn == null) {
                util.log("[red] unknown type: "+activeConfig[i].type);
            }
        }
    }
    // Clean up any orphaned credentials
    var deletedCredentials = false;
    for (var c in credentials) {
        var n = registry.get(c);
        if (!n) {
            deletedCredentials = true;
            delete credentials[c];
        }
    }
    if (deletedCredentials) {
        storage.saveCredentials(credentials);
    }
    events.emit("nodes-started");
}

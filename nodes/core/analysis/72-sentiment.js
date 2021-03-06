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

var RED = require(process.env.NODE_RED_HOME+"/red/red");
var sentiment = require('sentiment');

function SentimentNode(n) {
    RED.nodes.createNode(this,n);

    this.on("input", function(msg) {
            var node = this;
            sentiment(msg.payload, function (err, result) {
                msg.sentiment = result;
                node.send(msg);
            });
    });
}

RED.nodes.registerType("sentiment",SentimentNode);

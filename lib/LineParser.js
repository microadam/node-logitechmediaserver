var 
  util = require('util') 
, EventEmitter = require('events').EventEmitter 

// Parse incoming data stream splitting on \n and emitting "line" events
function LineParser(stream) {
  this.stream = stream
  this.buffer = ""
  var self = this
  this.stream.on("data", function(data) {
    self.parse(data)
  })
}
util.inherits(LineParser, EventEmitter)

LineParser.prototype.parse = function(data) {
  this.buffer += data
  var split = this.buffer.indexOf("\n")
  while (split > -1) {
    this.emit('line', this.buffer.slice(0, split))
    this.buffer = this.buffer.slice(split + 1)
    split = this.buffer.indexOf("\n")
  }
}

module.exports = LineParser
var util = require('util')
var EventEmitter = require('events').EventEmitter

function startsWith(search, s) {
  return s.substr(0, search.length) == search
}

function SqueezePlayer(telnet, index, mac) {
  this.telnet = telnet
  this.index = index
  this.mac = mac
  this.name = null
  this.volume = null

  this.runCmd('name ?')
  this.runCmd('mixer volume ?')
}
util.inherits(SqueezePlayer, EventEmitter)

SqueezePlayer.prototype.runCmd = function(cmd) {
  this.telnet.writeln(this.mac + ' ' + cmd)
}

SqueezePlayer.prototype.switchOff = function() {
  this.runCmd('power 0')
}

SqueezePlayer.prototype.switchOn = function() {
  this.runCmd('power 1')
}

SqueezePlayer.prototype.setVolume = function(volume) {
  this.runCmd('mixer volume ' + volume)
}

SqueezePlayer.prototype.setProperty = function(property, value) {
  this[property] = value
  this.emit(property, value)
  if (this.name && this.volume) {
    this.emit('update', this.get())
  }
}

SqueezePlayer.prototype.get = function() {
  var
    self = this
  , object = {}
  
  Object.keys(this).forEach(function(property) {
    if (["telnet", "_events"].indexOf(property) == -1) {
      object[property] = self[property]
    }
  })
  return object
}

SqueezePlayer.prototype.handleResponse = function(cmdString) {

  if (startsWith("mixer volume", cmdString)) {
    var volume = cmdString.match(/^mixer volume\s(.*?)$/)[1]
    // incremental change
    if (startsWith("+", volume) || startsWith("-", volume)) {
      this.setProperty('volume', this.volume + parseInt(volume))
      // explicit volume  
    } else {
      this.setProperty('volume', parseInt(volume))
    }
    return true
  }

  if (startsWith("name", cmdString)) {
    var name = cmdString.match(/^name\s(.*?)$/)[1]
    this.setProperty('name', name)
    return true
  }

  console.log('unhandled command: ' + this.mac + ' ' + cmdString)
}


module.exports = SqueezePlayer
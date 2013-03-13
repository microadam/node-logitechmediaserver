var util = require('util')
var EventEmitter = require('events').EventEmitter

function SqueezePlayer(cliInterface, index, mac) {
  this.cli = cliInterface
  this.index = index
  this.mac = mac
  this.name = null
  this.volume = null

  this.getVolume()
  this.getName()

  this.registerEvents()
}
util.inherits(SqueezePlayer, EventEmitter)

function startsWith(search, s) {
  return s.substr(0, search.length) == search
}

SqueezePlayer.prototype.runCmd = function(cmd) {
  this.cli.runCmd(this.mac + ' ' + cmd)
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

SqueezePlayer.prototype.getVolume = function(volume) {
  this.runCmd('mixer volume ?')
}

SqueezePlayer.prototype.getName = function(volume) {
  this.runCmd('name ?')
}

SqueezePlayer.prototype.setProperty = function(property, value) {
  this[property] = value
  this.emit(property, value)
  if (this.name && this.volume) {
    this.emit('update', this)
  }
}

SqueezePlayer.prototype.registerEvents = function() {
  var self = this

  this.cli.on(this.mac + ' nameChange', function(name) {
    self.setProperty('name', name)
  })

  this.cli.on(this.mac + ' volumeChange', function(volume) {
    // incremental change
    if (startsWith('+', volume) || startsWith('-', volume)) {
      self.setProperty('volume', self.volume + parseInt(volume))
      // explicit volume  
    } else {
      self.setProperty('volume', parseInt(volume))
    }
  })

}

SqueezePlayer.prototype.inspect = function() {
  var
    self = this
  , object = {}
  
  Object.keys(this).forEach(function(property) {
    if (['cli', '_events'].indexOf(property) == -1) {
      object[property] = self[property]
    }
  })
  return object
}


module.exports = SqueezePlayer
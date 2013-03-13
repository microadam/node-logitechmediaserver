var util = require('util')
var EventEmitter = require('events').EventEmitter

function SqueezePlayer(cliInterface, mac) {
  this.cli = cliInterface
  this.mac = mac
  this.name = null
  this.volume = null
  this.connectedState = false

  this.retrieveVolume()
  this.retrieveName()
  this.retrieveConnectedState()

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

SqueezePlayer.prototype.retrieveVolume = function(volume) {
  this.runCmd('mixer volume ?')
}

SqueezePlayer.prototype.retrieveName = function(volume) {
  this.runCmd('name ?')
}

SqueezePlayer.prototype.retrieveConnectedState = function(volume) {
  this.runCmd('connected ?')
}

SqueezePlayer.prototype.sync = function(player) {
  this.runCmd('sync ' + player.mac)
}

SqueezePlayer.prototype.unsync = function(volume) {
  this.runCmd('sync -')
}

SqueezePlayer.prototype.setProperty = function(property, value) {
  this[property] = value
  this.emit(property, value)

  if (this.name && this.volume && this.connectedState) {
    this.emit('update', this)
  }
}

SqueezePlayer.prototype.registerEvents = function() {
  var self = this

  this.cli.on(this.mac + ' nameChange', function(name) {
    self.setProperty('name', name)
  })

  this.cli.on(this.mac + ' connectedStateChange', function(state) {
    self.setProperty('connectedState', state)
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
/*
 * jQuery Stream @VERSION
 * Comet Streaming JavaScript Library 
 * http://code.google.com/p/jquery-stream/
 * 
 * Copyright 2011, Donghwan Kim 
 * Licensed under the Apache License, Version 2.0
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Compatible with jQuery 1.4+
 */
(function($, undefined) {

	// Stream object instances
	var instances = {},
	
		// Streaming agents
		agents = {},
	
		// HTTP Streaming transports
		transports = {},
		
		// Does the throbber of doom exist?
		throbber = $.browser.webkit && !$.isReady;
	
	// Stream is based on The WebSocket API 
	// W3C Working Draft 19 April 2011 - http://www.w3.org/TR/2011/WD-websockets-20110419/
	function Stream(url, options) {
		
		// Assigns url and merges options
		this.url = url;
		this.options = $.extend(true, {}, this.options, options);
		
		// Converts a value into a array
		for (var i in {open: 1, message: 1, error: 1, close: 1}) {
			this.options[i] = $.makeArray(this.options[i]); 
		}
		
		// The url and alias are a identifier of this instance within the document
		instances[this.url] = this;
		if (this.options.alias) {
			instances[this.options.alias] = this;
		}
		
		// Stream type
		var match = /^(http|ws)s?:/.exec(this.url);
		this.options.type = (match && match[1]) || this.options.type;
		
		// According to stream type, extends an agent
		$.extend(true, this, agents[this.options.type]);
		
		// Open
		if (this.options.type === "ws" || !throbber) {
			this.open();
		} else {
			var self = this;
			switch (this.options.throbber.type || this.options.throbber) {
			case "lazy":
				$(window).load(function() {
					setTimeout(function() {
						self.open();
					}, self.options.throbber.delay || 50);
				});
				break;
			case "reconnect":
				self.open();
				$(window).load(function() {
					if (self.readyState === 0) {
						self.options.open.push(function() {
							self.options.open.pop();
							setTimeout(function() {
								reconnect();
							}, 10);
						});
					} else {
						reconnect();
					}
					
					function reconnect() {
						self.options.close.push(function() {
							self.options.close.pop();
							setTimeout(function() {
								new Stream(self.url, self.options);
							}, self.options.throbber.delay || 50);
						});
						
						var reconn = self.options.reconnect;
						self.close();
						self.options.reconnect = reconn;
					}
				});
				break;
			}
		}
	}
		
	$.extend(Stream.prototype, {
		
		// The state of stream
		// 0: CONNECTING, 1: OPEN, 2: CLOSING, 3: CLOSED
		readyState: 0, 
		
		// Default options
		options: {
			// Stream type
			type: window.WebSocket ? "ws" : "http",
			// Whether to automatically reconnect when stream closed
			reconnect: true,
			// Whether to trigger global stream event handlers
			global: true,
			// Only for WebKit
			throbber: "lazy",
			// Message data type
			dataType: "text",
			// Message data converters
			converters: {
				text: window.String, 
				// jQuery.parseJSON is in jQuery 1.4.1
				json: $.parseJSON, 
				// jQuery.parseXML is in jQuery 1.5
				xml: $.parseXML
			},
			// Additional parameters for GET request
			openData: {
				//  Attaches a time stamp to prevent caching
				_: function() {
					return new Date().getTime();
				}
			}
			// WebSocket constructor argument
			// protocols: null,
			// XDomainRequest transport
			// enableXDR: false,
			// rewriteURL: null
		},
		
		trigger: function(event, props) {
			event = event.type ? 
				event : 
				$.extend($.Event(event), {bubbles: false, cancelable: false}, props);
			
			var handlers = this.options[event.type],
				applyArgs = [event, this];
			
			// Triggers local event handlers
			for (var i = 0; i < handlers.length; i++) {
				handlers[i].apply(this.options.context, applyArgs);
			}

			if (this.options.global) {
				// Triggers global event handlers
				$.event.trigger("stream" + event.type.substring(0, 1).toUpperCase() + event.type.substring(1), applyArgs);
			}
		}
		
	});
	
	// Once the window is fully loaded, the throbber of doom will not be appearing
	if (throbber) {
		$(window).load(function() {
			throbber = false;
		});
	}
	
	$.extend(agents, {
		
		// WebSocket
		ws: {
			open: function() {
				if (!window.WebSocket) {
					return;
				}
				
				var self = this,
					url = prepareURL(getAbsoluteURL(this.url).replace(/^http/, "ws"), this.options.openData);
				
				this.ws = this.options.protocols ? new window.WebSocket(url, this.options.protocols) : new window.WebSocket(url);
				
				// WebSocket event handlers
				$.extend(this.ws, {
					onopen: function(event) {
						self.readyState = 1;
						self.trigger(event);
					},
					onmessage: function(event) {
						self.trigger($.extend({}, event, {data: self.options.converters[self.options.dataType](event.data)}));
					},
					onerror: function(event) {
						self.options.reconnect = false;
						self.trigger(event);
					},
					onclose: function(event) {
						var readyState = self.readyState; 
						
						self.readyState = 3;
						self.trigger(event);

						// Reconnect?
						if (self.options.reconnect && readyState !== 0) {
							new Stream(self.url, self.options);
						}
					}
				});
				
				// Works even in IE6
				function getAbsoluteURL(url) {
					var div = document.createElement("div");
					div.innerHTML = "<a href='" + url + "'/>";

					return div.firstChild.href;
				}
			},
			send: function(data) {
				if (this.readyState === 0) {
					$.error("INVALID_STATE_ERR: Stream not open");
				}
				
				this.ws.send(typeof data === "string" ? data : $.param(data, $.ajaxSettings.traditional));
			},
			close: function() {
				if (this.readyState < 2) {
					this.readyState = 2;
					this.options.reconnect = false;
					this.ws.close();
				}
			}
		},
		
		// HTTP Streaming
		http: {
			open: function() {
				// Chooses a proper transport
				var transport = this.options.enableXDR && window.XDomainRequest ? "xdr" : window.ActiveXObject ? "iframe" : window.XMLHttpRequest ? "xhr" : null;
				if (!transport) {
					return;
				}
				
				$.extend(true, this, transports[transport]).connect();
			},
			send: function(data) {
				if (this.readyState === 0) {
					$.error("INVALID_STATE_ERR: Stream not open");
				}
				
				if (arguments.length) {
					// Converts data if not already a string and pushes it into the data queue
					this.dataQueue.push((typeof data === "string" ? data : $.param(data, $.ajaxSettings.traditional)) + "&");
				}
				
				if (this.sending !== true) {
					this.sending = true;
					
					// Performs an Ajax iterating through the data queue
					(function post() {
						if (this.readyState === 1 && this.dataQueue.length) {
							$.ajax({
								url: this.url,
								context: this,
								type: "POST",
								data: this.dataQueue.shift() + paramMetadata("send", {id: this.id}),
								complete: post
							});
						} else {
							this.sending = false;
						}
					}).call(this);
				}
			},
			close: function() {
				// Do nothing if the readyState is in the CLOSING or CLOSED
				if (this.readyState < 2) {
					this.readyState = 2;

					// Notifies the server
					$.post(this.url, paramMetadata("close", {id: this.id}));
					
					// Prevents reconnecting
					this.options.reconnect = false;
					this.disconnect();
				}
			},
			handleResponse: function(text) {
				if (this.readyState === 0) {
					// The top of the response is made up of the id and padding
					this.id = text.substring(0, text.indexOf(";"));
					this.message = {index: text.indexOf(";", this.id.length + 1) + 1, size: null, data: ""};
					this.dataQueue = this.dataQueue || [];
					
					this.readyState = 1;
					this.trigger("open");
					
					// In case of reconnection, continues to communicate
					this.send();
				}
				
				// Parses messages
				// message format = message-size ; message-data ;
				for (;;) {
					if (this.message.size == null) {
						// Checks a semicolon of size part
						var sizeEnd = text.indexOf(";", this.message.index);
						if (sizeEnd < 0) {
							return;
						}
						
						this.message.size = +text.substring(this.message.index, sizeEnd);
						this.message.index = sizeEnd + 1;
					}
					
					var data = text.substr(this.message.index, this.message.size - this.message.data.length);
					this.message.data += data;
					this.message.index += data.length;

					// Has this message been completed?
					if (this.message.size !== this.message.data.length) {
						return;
					}
					
					// Checks a semicolon of data part
					var dataEnd = text.indexOf(";", this.message.index);
					if (dataEnd < 0) {
						return;
					}
					this.message.index = dataEnd + 1;
					
					// Converts the data type
					this.message.data = this.options.converters[this.options.dataType](this.message.data);
					
					if (this.readyState < 3) {
						// Pseudo MessageEvent
						this.trigger("message", {
							data: this.message.data, 
							origin: "", 
							lastEventId: "", 
							source: null, 
							ports: null
						});
					}
					
					// Resets the data and size
					this.message.size = null;
					this.message.data = "";
				}
			},
			handleClose: function(isError) {
				var readyState = this.readyState;
				this.readyState = 3;
				
				if (isError) {
					// Prevents reconnecting
					this.options.reconnect = false;
					
					switch (readyState) {
					// If establishing a connection fails, fires the close event instead of the error event 
					case 0:
						// Pseudo CloseEvent
						this.trigger("close", {
							wasClean: false, 
							code: null, 
							reason: ""
						});
						break;
					case 1:
					case 2:
						this.trigger("error");
						break;
					}
				} else {
					// Pseudo CloseEvent
					this.trigger("close", {
						// Presumes that the stream closed cleanly
						wasClean: true, 
						code: null, 
						reason: ""
					});
					
					// Reconnect?
					if (this.options.reconnect) {
						new Stream(this.url, this.options);
					}
				}
			}
		}
	
	});
	
	$.extend(transports, {
		
		// XMLHttpRequest: Modern browsers except Internet Explorer
		xhr: {
			connect: function() {
				var self = this;
				
				this.xhr = new window.XMLHttpRequest();
				this.xhr.onreadystatechange = function() {
					switch (this.readyState) {
					// Handles open and message event
					case 3:
						if (this.status !== 200) {
							return;
						}
						
						self.handleResponse(this.responseText);
						
						// For Opera
						if ($.browser.opera && !this.polling) {
							this.polling = true;
							
							iterate(this, function() {
								if (this.readyState === 4) {
									return false;
								}
								
								if (this.responseText.length > self.message.index) {
									self.handleResponse(this.responseText);
								}
							});
						}
						break;
					// Handles error or close event
					case 4:
						// HTTP status 0 could mean that the request is terminated by abort method
						// but it's not error in Stream object
						self.handleClose(this.status !== 200 && this.preStatus !== 200);
						break;
					}
				};
				this.xhr.open("GET", prepareURL(this.url, this.options.openData));
				this.xhr.send();
			},
			disconnect: function() {
				// Saves status
				try {
					this.xhr.preStatus = this.xhr.status;
				} catch (e) {}
				this.xhr.abort();
			}
		},
		
		// Hidden iframe: Internet Explorer
		iframe: {
			connect: function() {
				this.doc = new window.ActiveXObject("htmlfile");
				this.doc.open();
				this.doc.close();
				
				var iframe = this.doc.createElement("iframe");
				iframe.src = prepareURL(this.url, this.options.openData);
				
				this.doc.body.appendChild(iframe);
				
				// For the server to respond in a consistent format regardless of user agent, we polls response text
				var cdoc = iframe.contentDocument || iframe.contentWindow.document;

				iterate(this, function() {
					var html = cdoc.documentElement;
					if (!html) {
						return;
					}
					
					// Detects connection failure
					if (cdoc.readyState === "complete") {
						try {
							$.noop(cdoc.fileSize);
						} catch(e) {
							this.handleClose(true);
							return false;
						}
					}
					
					var response = cdoc.body.firstChild;
					
					// Handles open event
					this.handleResponse(response.innerText);
					
					// Handles message and close event
					iterate(this, function() {
						var text = response.innerText;
						if (text.length > this.message.index) {
							this.handleResponse(text);
							
							// Empties response every time that it is handled
							response.innerText = "";
							this.message.index = 0;
						}

						if (cdoc.readyState === "complete") {
							this.handleClose();
							return false;
						}
					});
					
					return false;
				});
			},
			disconnect: function() {
				this.doc.execCommand("Stop");
			}
		},
		
		// XDomainRequest: Optionally IE9, IE8
		xdr: {
			connect: function() {
				var self = this;
				
				this.xdr = new window.XDomainRequest();
				// Handles open and message event
				this.xdr.onprogress = function() {
					self.handleResponse(this.responseText);
				};
				// Handles error event
				this.xdr.onerror = function() {
					self.handleClose(true);
				};
				// Handles close event
				this.xdr.onload = function() {
					self.handleClose();
				};
				this.xdr.open("GET", prepareURL((this.options.rewriteURL || rewriteURL)(this.url), this.options.openData));
				this.xdr.send();
				
				function rewriteURL(url) {
					var rewriters = {
						// Java - http://download.oracle.com/javaee/5/tutorial/doc/bnagm.html
						JSESSIONID: function(sid) {
							return url.replace(/;jsessionid=[^\?]*|(\?)|$/, ";jsessionid=" + sid + "$1");
						},
						// PHP - http://www.php.net/manual/en/session.idpassing.php
						PHPSESSID: function(sid) {
							return url.replace(/\?PHPSESSID=[^&]*&?|\?|$/, "?PHPSESSID=" + sid + "&").replace(/&$/, "");
						}
					};
					
					for (var name in rewriters) {
						// Finds session id from cookie
						var matcher = new RegExp("(?:^|;\\s*)" + encodeURIComponent(name) + "=([^;]*)").exec(document.cookie);
						if (matcher) {
							return rewriters[name](matcher[1]);
						}
					}
					
					return url;
				}
			},
			disconnect: function() {
				var onload = this.xdr.onload;
				this.xdr.abort();
				onload();
			}
		}
		
	});
		
	// Closes all stream when the document is unloaded 
	// this works right only in IE
	$(window).bind("unload.stream", function() {
		$.each(instances, function(url) {
			this.close();
			delete instances[url];
		});
	});
	
	function iterate(context, fn) {
		(function loop() {
			setTimeout(function() {
				if (fn.call(context) === false) {
					return;
				}
				
				loop();
			}, 0);
		})();
	}

	function prepareURL(url, data) {
		var params = {};
		for (var i in data) {
			params[i] = $.isFunction(data[i]) ? data[i].call(window) : data[i];
		}
		
		return url + (/\?/.test(url) ? "&" : "?") + $.param(params);
	}

	function paramMetadata(type, props) {
		props = $.extend({}, props, {type: type});
		
		var answer = {};
		for (var key in props) {
			answer["metadata." + key] = props[key];
		}
		
		return $.param(answer);
	}
	
	$.stream = function(url, options) {
		switch (arguments.length) {
		case 0:
			for (var i in instances) {
				return instances[i];
			}
			return null;
		case 1:
			return instances[url] || null;
		default:
			return instances[url] && instances[url].readyState !== 3 ? instances[url] : new Stream(url, options);
		}
	};
	
	$.extend($.stream, {
		
		version: "@VERSION",
		
		options: Stream.prototype.options,
		
		setup: function(options) {
			return $.extend(true, Stream.prototype.options, options);
		}
	
	});
	
	$.each("streamOpen streamMessage streamError streamClose".split(" "), function(i, o) {
		$.fn[o] = function(f) {
			return this.bind(o, f);
		};
	});
	
})(jQuery);
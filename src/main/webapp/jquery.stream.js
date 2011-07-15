/*
 * jQuery Stream @VERSION
 * Comet Streaming JavaScript Library 
 * http://code.google.com/p/jquery-stream/
 * 
 * Copyright 2011, Donghwan Kim 
 * Licensed under the Apache License, Version 2.0
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Compatible with jQuery 1.5+
 */
(function($, undefined) {

	var // Stream object instances
		instances = {},
	
		// Streaming agents
		agents = {},
	
		// HTTP Streaming transports
		transports = {},
		
		// Does the throbber of doom exist?
		throbber = $.browser.webkit && !$.isReady;
	
	// Once the window is fully loaded, the throbber of doom will not be appearing
	if (throbber) {
		$(window).load(function() {
			throbber = false;
		});
	}
	
	// Stream is based on The WebSocket API 
	// W3C Working Draft 19 April 2011 - http://www.w3.org/TR/2011/WD-websockets-20110419/
	$.stream = function(url, options) {
		// Returns the first Stream in the document
		if (!url) {
			for (var i in instances) {
				return instances[i];
			}
			return null;
			
		// Returns the Stream to which the specified url or alias is mapped. 
		} else if (!options) {
			return instances[url] || null;
			
		// If the Stream to which the given url is mapped exists and not closed, returns it
		} else if (instances[url] && instances[url].readyState !== 3) {
			return instances[url];
		}
		
		var stream = {
			
				url: url,
				
				// Merges options
				options: $.stream.setup({}, options),
				
				// The state of stream
				// 0: CONNECTING, 1: OPEN, 2: CLOSING, 3: CLOSED
				readyState: 0, 
				
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
				
			};
		
		// Converts a value into a array
		for (var i in {open: 1, message: 1, error: 1, close: 1}) {
			stream.options[i] = $.makeArray(stream.options[i]); 
		}
		
		// The url and alias are a identifier of this instance within the document
		instances[stream.url] = stream;
		if (stream.options.alias) {
			instances[stream.options.alias] = stream;
		}
		
		// Stream type
		var match = /^(http|ws)s?:/.exec(stream.url);
		stream.options.type = (match && match[1]) || stream.options.type;
		
		// According to stream type, extends an agent
		$.extend(true, stream, agents[stream.options.type]);
		
		// Open
		if (stream.options.type === "ws" || !throbber) {
			stream.open();
		} else {
			switch (stream.options.throbber.type || stream.options.throbber) {
			case "lazy":
				$(window).load(function() {
					setTimeout(function() {
						stream.open();
					}, stream.options.throbber.delay || 50);
				});
				break;
			case "reconnect":
				stream.open();
				$(window).load(function() {
					if (stream.readyState === 0) {
						stream.options.open.push(function() {
							stream.options.open.pop();
							setTimeout(function() {
								reconnect();
							}, 10);
						});
					} else {
						reconnect();
					}
					
					function reconnect() {
						stream.options.close.push(function() {
							stream.options.close.pop();
							setTimeout(function() {
								$.stream(stream.url, stream.options);
							}, stream.options.throbber.delay || 50);
						});
						
						var reconn = stream.options.reconnect;
						stream.close();
						stream.options.reconnect = reconn;
					}
				});
				break;
			}
		}
		
		return stream;
	};
	
	$.extend($.stream, {
		
		version: "@VERSION",
		
		// Logic borrowed from jQuery.ajaxSetup
		setup: function(target, options) {
			if (!options) {
				options = target;
				target = $.extend(true, $.stream.options, options); 
			} else {
				$.extend(true, target, $.stream.options, options);
			}
			
			for(var field in {context: 1, url: 1}) {
				if (field in options) {
					target[field] = options[field];
				} else if(field in $.stream.options) {
					target[field] = $.stream.options[field];
				}
			}
			
			return target;
		},
		
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
				json: $.parseJSON, 
				xml: $.parseXML
			}
			// Additional parameters for GET request
			// openData: null,
			// WebSocket constructor argument
			// protocols: null,
			// XDomainRequest transport
			// enableXDR: false,
			// rewriteURL: null
		}
	
	});
	
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
							$.stream(self.url, self.options);
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
				
				this.ws.send(typeof data === "string" ? data : param(data));
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
				// Data queue
				this.dataQueue = [];
				// Helper object for parsing response
				this.message = {
					// The index from which to start parsing
					index: 0,
					// The temporary data
					data: ""
				};
				
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
				
				// Pushes the data into the queue
				this.dataQueue.push(data);
				
				if (this.sending !== true) {
					this.sending = true;
					
					var self = this;
					
					// Performs an Ajax iterating through the data queue
					(function post() {
						if (self.readyState === 1 && self.dataQueue.length) {
							var type = "send",
								options = {
									url: self.url,
									type: "POST",
									data: self.dataQueue.shift()
								};
							
							if (self.options.handleSend) {
								if (self.options.handleSend.call(self, type, options) === false) {
									post();
									return;
								}
							} else {
								// Converts data if not already a string and attaches metadata
								options.data = (typeof options.data === "string" ? options.data : param(options.data))
									+ "&" 
									+ paramMetadata({type: type, id: self.id});
							}
							
							// Adds the complete callback
							$.ajax(options).complete(post);
						} else {
							self.sending = false;
						}
					})();
				}
			},
			close: function() {
				// Do nothing if the readyState is in the CLOSING or CLOSED
				if (this.readyState < 2) {
					this.readyState = 2;
					
					var skip,
						type = "close",
						options = {
							url: this.url,
							type: "POST"
						};
					
					if (this.options.handleSend) {
						if (this.options.handleSend.call(this, type, options) === false) {
							skip = true;
						}
					} else {
						options.data = paramMetadata({type: type, id: this.id});
					}
					
					if (!skip) {
						// Notifies the server
						$.ajax(options);
					}

					// Prevents reconnecting
					this.options.reconnect = false;
					this.disconnect();
				}
			},
			handleResponse: function(text) {
				// Handles open
				if (this.readyState === 0) {
					if (this.options.handleOpen) {
						if (this.options.handleOpen.call(this, text) === false) {
							return;
						}
					} else {
						// The top of the response is made up of the id and padding
						this.id = text.substring(0, text.indexOf(";"));
						// this.message.index = text.indexOf(";", this.id.length + ";".length) + ";".length;
						this.message.index = text.indexOf(";", this.id.length + 1) + 1;
					}
					
					this.readyState = 1;
					this.trigger("open");
				}
				
				// Handles messages
				for (;;) {
					if (this.options.handleMessage) {
						if (this.options.handleMessage.call(this, text) === false) {
							return;
						}
					} else {
						// Response could contain a single message, multiple messages or a fragment of a message
						// default message format is message-size ; message-data ;
						if (this.message.size == null) {
							// Checks a semicolon of size part
							var sizeEnd = text.indexOf(";", this.message.index);
							if (sizeEnd < 0) {
								return;
							}
							
							this.message.size = +text.substring(this.message.index, sizeEnd);
							// index: sizeEnd + ";".length,
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
						
						// this.message.index = dataEnd + ";".length;
						this.message.index = dataEnd + 1;
						
						// Completes parsing
						delete this.message.size;
					}
					
					if (this.readyState < 3) {
						// Pseudo MessageEvent
						this.trigger("message", {
							// Converts the data type
							data: this.options.converters[this.options.dataType](this.message.data), 
							origin: "", 
							lastEventId: "", 
							source: null, 
							ports: null
						});
					}
					
					// Resets the data
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
						$.stream(this.url, this.options);
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
					
					var response = cdoc.body.firstChild,
						readResponse = function() {
							// Clones the element not to disturb the original one
							var clone = response.cloneNode(true);
							
							// If the last character is a carriage return or a line feed, IE ignores it in the innerText property 
							// therefore, we add another non-newline character to preserve it
							clone.appendChild(cdoc.createTextNode("."));
							
							var text = clone.innerText;
							return text.substring(0, text.length - 1);
						};
					
					// Handles open event
					this.handleResponse(readResponse());
					
					// Handles message and close event
					iterate(this, function() {
						var text = readResponse();
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
		
		// XDomainRequest: Optionally Internet Explorer 8+
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
		var rts = /([?&]_=)[^&]*/;

		// Converts data into a query string
		if (data && typeof data !== "string") {
			data = param(data);
		}
		
		// Attaches a time stamp to prevent caching
		return (rts.test(url) ? url : (url + (/\?/.test(url) ? "&" : "?") + "_=")).replace(rts, "$1" + new Date().getTime())
		+ (data ? ("&" + data) : "");
	}

	function paramMetadata(props) {
		var answer = {};
		for (var key in props) {
			answer["metadata." + key] = props[key];
		}
		
		return param(answer);
	}
	
	function param(data) {
		return $.param(data, $.ajaxSettings.traditional);
	}
	
	$.each("streamOpen streamMessage streamError streamClose".split(" "), function(i, o) {
		$.fn[o] = function(f) {
			return this.bind(o, f);
		};
	});
	
})(jQuery);
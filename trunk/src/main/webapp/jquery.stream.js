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
		
		// Sockets
		sockets = {},
		
		// Transports
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
		if (!arguments.length) {
			for (var i in instances) {
				return instances[i];
			}
			
			return null;
		}
		
		// Stream to which the specified url or alias is mapped
		var instance = instances[url];
		if (!options) {
			return instance || null;
		} else if (instance && instance.readyState < 3) {
			return instance;
		}
		
		var // Socket
			socket,
			// Stream object
			stream = {
				// URL to which to connect
				url: url,
				// Merges options
				options: $.stream.setup({}, options),
				// The state of stream
				// 0: CONNECTING, 1: OPEN, 2: CLOSING, 3: CLOSED
				readyState: 0,
				// Transmits data using the connection
				send: function(data) {
					if (stream.readyState === 0) {
						$.error("INVALID_STATE_ERR: Stream not open");
					}
					
					socket.send(data);
				},
				// Disconnects the connection
				close: function() {
					// Do nothing if the readyState is in the CLOSING or CLOSED
					if (stream.readyState < 2) {
						stream.readyState = 2;
						
						// Prevents reconnecting
						stream.options.reconnect = false;
						
						socket.close();
					}
				}
			};
				
		// Makes arrays of event handlers
		for (var i in {open: 1, message: 1, error: 1, close: 1}) {
			stream.options[i] = $.makeArray(stream.options[i]); 
		}
			
		// Chooses a proper socket
		stream.options.type = 
			/^(ws)s?:/.exec(url) ? 
				"ws" : 
				$.isFunction(stream.options.type) ?
					stream.options.type() : 
					stream.options.type;
		
		// Undefined socket type stands for HTTP transport
		if (!sockets[stream.options.type]) {
			stream.options.transport = stream.options.type;
			stream.options.type = "http";
		}
		
		// Create a socket with the stream event handler
		socket = sockets[stream.options.type](stream, {
			// Called when a connection has been established
			onopen: function(event) {
				if (stream.readyState === 0) {
					stream.readyState = 1;
					trigger(event || "open");
				}
			},
			// Called when a complete message has been received
			onmessage: function(event) {
				if (stream.readyState === 1 || stream.readyState === 2) {
					if (event.type) {
						trigger($.extend({}, event, {data: stream.options.converters[stream.options.dataType](event.data)}));
					} else {
						// Pseudo MessageEvent
						trigger("message", {
							// Converts the data type
							data: stream.options.converters[stream.options.dataType](event.data), 
							origin: "", 
							lastEventId: "", 
							source: null, 
							ports: null
						});
					}
				}
			},
			// Called when a connection has been closed
			onclose: function(event) {
				var readyState = stream.readyState; 
				if (stream.readyState < 3) {
					stream.readyState = 3;
					
					if (event) {
						trigger(event);
					} else {
						// Pseudo CloseEvent
						trigger("close", {
							// Presumes that the stream closed cleanly
							wasClean: true, 
							code: null, 
							reason: ""
						});
					}
					
					// Reconnect?
					if (stream.options.reconnect && readyState) {
						$.stream(url, options);
					}
				}
			},
			// Called when a connection has been closed due to an error
			onerror: function(event) {
				var readyState = stream.readyState;
				if (readyState < 3) {
					stream.readyState = 3;
					
					// Prevents reconnecting
					stream.options.reconnect = false;
					
					if (event) {
						trigger(event);
					} else {
						// If establishing a connection fails, fires the close event instead of the error event 
						if (readyState === 0) {
							// Pseudo CloseEvent
							trigger("close", {
								wasClean: false, 
								code: null, 
								reason: ""
							});
						} else {
							trigger("error");
						}
					}
				}
			},
			// Helper for preparing the URL 
			url: function() {
				var data = stream.options.openData;
				
				// Converts data into a query string
				if (data && typeof data !== "string") {
					data = param(data);
				}
				
				// Attaches a time stamp to prevent caching
				var ts = $.now(),
					ret = url.replace(/([?&])_=[^&]*/, "$1_=" + ts);

				return ret + (ret === url ? (/\?/.test(url) ? "&" : "?") + "_=" + ts : "") + (data ? ("&" + data) : "");
			}
		});
		
		// The url and alias are a identifier of this instance within the document
		instances[url] = stream;
		if (stream.options.alias) {
			instances[stream.options.alias] = stream;
		}

		// Trigger helper
		function trigger(event, props) {
			event = event.type ? 
				event : 
				$.extend($.Event(event), {bubbles: false, cancelable: false}, props);
			
			var handlers = stream.options[event.type],
				applyArgs = [event, stream];
			
			// Triggers local event handlers
			for (var i = 0, length = handlers.length; i < length; i++) {
				handlers[i].apply(stream.options.context, applyArgs);
			}

			if (stream.options.global) {
				// Triggers global event handlers
				$.event.trigger("stream" + event.type.substring(0, 1).toUpperCase() + event.type.substring(1), applyArgs);
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
			
			for (var field in {context: 1, url: 1}) {
				if (field in options) {
					target[field] = options[field];
				} else if (field in $.stream.options) {
					target[field] = $.stream.options[field];
				}
			}
			
			return target;
		},
		
		options: {
			// Stream type
			type: window.WebSocket || window.MozWebSocket ? "ws" : "http",
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
			// openData: null,
			// protocols: null,
			// enableXDR: false,
			// rewriteURL: null
			// operaInterval: 0
			// iframeInterval: 0,
			// transport: null
		},
		
		transport: function(name, fn) {
			transports[name] = fn;
		}
	
	});
	
	$.extend(sockets, {
		
		// WebSocket
		ws: function(stream, eh) {
			var // Absolute WebSocket URL
				url = getAbsoluteURL(eh.url()).replace(/^http/, "ws"),
				// WebSocket constructor
				WebSocket = window.WebSocket || window.MozWebSocket,
				// WebSocket instance
				ws = stream.options.protocols ? new WebSocket(url, stream.options.protocols) : new WebSocket(url);
			
			// Adds event handlers
			$.extend(ws, eh);
			
			return {
				send: function(data) {
					ws.send(typeof data === "string" ? data : param(data));
				},
				close: function() {
					ws.close();
				}
			};
		},
		
		// HTTP
		http: function(stream, eh) {
			var // Latch for AJAX
				sending,
				// Data queue
				dataQueue = [],
				// Request handler
				handleSend = stream.options.handleSend || function(type, options, stream) {
					options.headers = {
						"x-jquery-stream-id": stream.id || "undefined",
						"x-jquery-stream-type": type
					};
				},
				// Helper object for parsing chunks
				message = {
					// The index from which to start parsing
					index: 0,
					// The temporary data
					data: ""
				},
				// Streaming response handler
				handleOpen = stream.options.handleOpen || function(text, message, stream) {
					// The top of the response is made up of the id and padding
					// optional identifier within the server
					stream.id = text.substring(0, text.indexOf(";"));
					
					// message.index = text.indexOf(";", stream.id.length + ";".length) + ";".length;
					message.index = text.indexOf(";", stream.id.length + 1) + 1;
					
					// The text must contain id;padding;
					if (text.charAt(stream.id.length) !== ";" || !message.index) {
						// TODO stream.close(code, reason);
						stream.close();
						return false;
					}
				},
				handleMessage = stream.options.handleMessage || function(text, message, stream) {
					// A chunk could contain a single message, multiple messages or a fragment of a message
					// default message format is message-size ; message-data ;
					if (message.size == null) {
						// Checks a semicolon of size part
						var sizeEnd = text.indexOf(";", message.index);
						if (sizeEnd < 0) {
							return false;
						}
						
						message.size = +text.substring(message.index, sizeEnd);
						
						// The message size must be a positive number
						if (isNaN(message.size) || message.size < 0) {
							// TODO stream.close(code, reason);
							stream.close();
							return false;
						}
						
						// message.index = sizeEnd + ";".length;
						message.index = sizeEnd + 1;
					}
					
					var data = text.substr(message.index, message.size - message.data.length);
					message.data += data;
					message.index += data.length;
					
					// Has this message been completed?
					if (message.data.length < message.size) {
						return false;
					}
					
					// Checks a semicolon of data part
					// var endChar = text.substr(message.index, ";".length);
					var endChar = text.charAt(message.index);
					if (!endChar) {
						return false;
					} else if (endChar !== ";") {
						// TODO stream.close(code, reason);
						stream.close();
						return false;
					}
					
					// message.index = message.index + ";".length;
					message.index++;
					
					// Completes parsing
					delete message.size;
				},
				// Transport
				transport;
			
			// Chooses a proper transport
			// the default one is streaming transport
			stream.options.transport = stream.options.transport || 
				(stream.options.enableXDR && window.XDomainRequest ? "xdr" : 
				window.ActiveXObject ? "iframe" : 
				window.XMLHttpRequest ? "xhr" : null);
			
			transport = transports[stream.options.transport](stream, $.extend(eh, {
				// Called when a chunk has been received
				onread: function(text) {
					if (stream.readyState === 0) {
						if (handleOpen(text, message, stream) === false) {
							return;
						}
						
						eh.onopen();
					}
					
					for (;;) {
						if (handleMessage(text, message, stream) === false) {
							return;
						}
						
						eh.onmessage({data: message.data});
						
						// Resets the data
						message.data = "";
					}
				},
				message: message
			}));

			// Deals with the throbber of doom
			if (!throbber) {
				setTimeout(transport.open, 1);
			} else {
				switch (stream.options.throbber.type || stream.options.throbber) {
				case "lazy":
					$(window).load(function() {
						setTimeout(transport.open, stream.options.throbber.delay || 50);
					});
					break;
				case "reconnect":
					transport.open();
					$(window).load(function() {
						if (stream.readyState === 0) {
							stream.options.open.push(function() {
								stream.options.open.pop();
								setTimeout(reconnect, 10);
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
			
			return {
				send: function(data) {
					// Pushes the data into the queue
					dataQueue.push(data);
					
					if (!sending) {
						sending = true;
												
						// Performs an Ajax iterating through the data queue
						(function post() {
							if (stream.readyState === 1 && dataQueue.length) {
								var options = {url: stream.url, type: "POST", data: dataQueue.shift()};
								
								if (handleSend("send", options, stream) !== false) {
									$.ajax(options).complete(post);
								} else {
									post();
								}
							} else {
								sending = false;
							}
						})();
					}
				},
				close: function() {
					var options = {url: stream.url, type: "POST"};
					if (handleSend("close", options, stream) !== false) {
						// Notifies the server
						$.ajax(options);
					}
					
					transport.close();
				}
			};
		}
		
	});

	$.extend(transports, {
		
		// XMLHttpRequest
		xhr: function(stream, eh) {
			var stop,
				preStatus, 
				xhr = new window.XMLHttpRequest();
			
			xhr.onreadystatechange = function() {
				switch (xhr.readyState) {
				// Handles open and message event
				case 3:
					if (xhr.status !== 200) {
						return;
					}
					
					eh.onread(xhr.responseText);
					
					// For Opera
					if ($.browser.opera && !stop) {
						stop = iterate(function() {
							if (xhr.responseText.length > eh.message.index) {
								eh.onread(xhr.responseText);
							}
						}, stream.options.operaInterval);
					}
					break;
				// Handles error or close event
				case 4:
					if (stop) {
						stop();
					}
					
					// HTTP status 0 could mean that the request is terminated by abort method
					// but it's not error in Stream object
					eh[xhr.status !== 200 && preStatus !== 200 ? "onerror" : "onclose"]();
					break;
				}
			};
			
			return {
				open: function() {
					xhr.open("GET", eh.url());
					xhr.send();
				},
				close: function() {
					// Saves status
					try {
						preStatus = xhr.status;
					} catch (e) {}
					xhr.abort();
				}
			};
		},
		
		// Iframe
		iframe: function(stream, eh) {
			var stop,
				doc = new window.ActiveXObject("htmlfile");
			
			doc.open();
			doc.close();
			
			return {
				open: function() {
					var iframe = doc.createElement("iframe");
					iframe.src = eh.url();
					
					doc.body.appendChild(iframe);
					
					// For the server to respond in a consistent format regardless of user agent, we polls response text
					var cdoc = iframe.contentDocument || iframe.contentWindow.document;
					
					stop = iterate(function() {
						if (!cdoc.firstChild) {
							return;
						}
						
						// Detects connection failure
						if (cdoc.readyState === "complete") {
							try {
								$.noop(cdoc.fileSize);
							} catch(e) {
								eh.onerror();
								return false;
							}
						}
						
						var response = cdoc.body ? cdoc.body.lastChild : cdoc,
							readResponse = function() {
								// Clones the element not to disturb the original one
								var clone = response.cloneNode(true);
								
								// If the last character is a carriage return or a line feed, IE ignores it in the innerText property 
								// therefore, we add another non-newline character to preserve it
								clone.appendChild(cdoc.createTextNode("."));
								
								var text = clone.innerText;
								return text.substring(0, text.length - 1);
							};
						
						// To support text/html content type
						if (!$.nodeName(response, "pre")) {
							// Injects a plaintext element which renders text without interpreting the HTML and cannot be stopped
							// it is deprecated in HTML5, but still works
							var head = cdoc.head || cdoc.getElementsByTagName("head")[0] || cdoc.documentElement || cdoc,
								script = cdoc.createElement("script");
							
							script.text = "document.write('<plaintext>')";
							
							head.insertBefore(script, head.firstChild);
							head.removeChild(script);
							
							// The plaintext element will be the response container
							response = cdoc.body.lastChild;
						}
						
						// Handles open event
						eh.onread(readResponse());
						
						// Handles message and close event
						stop = iterate(function() {
							var text = readResponse();
							if (text.length > eh.message.index) {
								eh.onread(text);
								
								// Empties response every time that it is handled
								response.innerText = "";
								eh.message.index = 0;
							}
		
							if (cdoc.readyState === "complete") {
								eh.onclose();
								return false;
							}
						}, stream.options.iframeInterval);
						
						return false;
					});
				},
				close: function() {
					if (stop) {
						stop();
					}
					
					doc.execCommand("Stop");
					eh.onclose();
				}
			};
		},

		// XDomainRequest
		xdr: function(stream, eh) {
			var xdr = new window.XDomainRequest(),
				rewriteURL = stream.options.rewriteURL || function(url) {
					// Maintaining session by rewriting URL
					// http://stackoverflow.com/questions/6453779/maintaining-session-by-rewriting-url
					var rewriters = {
						JSESSIONID: function(sid) {
							return url.replace(/;jsessionid=[^\?]*|(\?)|$/, ";jsessionid=" + sid + "$1");
						},
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
				};
			
			// Handles open and message event
			xdr.onprogress = function() {
				eh.onread(xdr.responseText);
			};
			// Handles error event
			xdr.onerror = function() {
				eh.onerror();
			};
			// Handles close event
			xdr.onload = function() {
				eh.onclose();
			};
			
			return {
				open: function() {
					xdr.open("GET", rewriteURL(eh.url()));
					xdr.send();
				},
				close: function() {
					xdr.abort();
					eh.onclose();
				}
			};
		}
		
	});
	
	// Closes all stream when the document is unloaded 
	// this works right only in IE
	$(window).bind("unload.stream", function() {
		for (var url in instances) {
			instances[url].close();
			delete instances[url];
		}
	});
	
	$.each("streamOpen streamMessage streamError streamClose".split(" "), function(i, o) {
		$.fn[o] = function(f) {
			return this.bind(o, f);
		};
	});
	
	// Works even in IE6
	function getAbsoluteURL(url) {
		var div = document.createElement("div");
		div.innerHTML = "<a href='" + url + "'/>";

		return div.firstChild.href;
	}
	
	function param(data) {
		return $.param(data, $.ajaxSettings.traditional);
	}
	
	function iterate(fn, interval) {
		var timeoutId;
		
		// Though the interval is 0 for real-time application, there is a delay between setTimeout calls
		// For detail, see https://developer.mozilla.org/en/window.setTimeout#Minimum_delay_and_timeout_nesting
		interval = interval || 0;
		
		(function loop() {
			timeoutId = setTimeout(function() {
				if (fn() === false) {
					return;
				}
				
				loop();
			}, interval);
		})();
		
		return function() {
			clearTimeout(timeoutId);
		};
	}
	
})(jQuery);
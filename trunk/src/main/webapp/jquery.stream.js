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
	
		// Constructors
		constructors = {},
	
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

		// WebSocket or HTTP
		var match = /^(http|ws)s?:/.exec(url);
		options.type = match && match[1] || $.stream.options.type;
		
		// Creates a Stream object
		var stream = constructors[options.type](url, options);
		
		// The url and alias are a identifier of this instance within the document
		instances[url] = stream;
		if (options.alias) {
			instances[options.alias] = stream;
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
			// openData: null,
			// protocols: null,
			// enableXDR: false,
			// rewriteURL: null
			// operaInterval: 0
			// iframeInterval: 0,
			// transport: null,
			// transports: null,
		}
	
	});
	
	$.extend(constructors, {
		
		// Base
		stream: function(url, options) {
			// Merges options
			options = $.stream.setup({}, options);
			
			// Makes arrays of event handlers
			for (var i in {open: 1, message: 1, error: 1, close: 1}) {
				options[i] = $.makeArray(options[i]); 
			}
			
			return {
				// URL to which to connect
				url: url,
				// Stream options
				options: options,
				// The state of stream
				// 0: CONNECTING, 1: OPEN, 2: CLOSING, 3: CLOSED
				readyState: 0,
				// Fake send
				send: function() {},
				// Fake close
				close: function() {}
			};
		},

		// WebSocket
		ws: function(url, options) {
			// Base
			var stream = constructors.stream(url, options);
			if (!window.WebSocket) {
				return stream;
			}
			
			var // Absolute WebSocket URL
				wsURL = prepareURL(getAbsoluteURL(stream.url).replace(/^http/, "ws"), stream.options.openData),
				// WebSocket instance
				ws = stream.options.protocols ? new window.WebSocket(wsURL, stream.options.protocols) : new window.WebSocket(wsURL);
			
			// WebSocket event handlers
			$.extend(ws, {
				onopen: function(event) {
					stream.readyState = 1;
					trigger(stream, event);
				},
				onmessage: function(event) {
					trigger(stream, $.extend({}, event, {data: stream.options.converters[stream.options.dataType](event.data)}));
				},
				onerror: function(event) {
					stream.options.reconnect = false;
					trigger(stream, event);
				},
				onclose: function(event) {
					var readyState = stream.readyState; 
					
					stream.readyState = 3;
					trigger(stream, event);

					// Reconnect?
					if (stream.options.reconnect && !readyState) {
						$.stream(url, options);
					}
				}
			});
			
			// Overrides send and close
			return $.extend(stream, {
				send: function(data) {
					if (stream.readyState === 0) {
						$.error("INVALID_STATE_ERR: Stream not open");
					}
					
					ws.send(typeof data === "string" ? data : param(data));
				},
				close: function() {
					if (stream.readyState < 2) {
						stream.readyState = 2;
						stream.options.reconnect = false;
						ws.close();
					}
				}
			});
		},
		
		// HTTP
		http: function(url, options) {
			var // Base
				stream = constructors.stream(url, options),
				// Transport
				transportName,
				transportFn,
				transport,
				// Listeners for transport,
				on = {},
				// Request and response handler
				handleOpen,
				handleMessage,
				handleSend,
				// Helper object for parsing chunks
				message = {
					// The index from which to start parsing
					index: 0,
					// The temporary data
					data: ""
				},
				// Latch for AJAX
				sending,
				// Data queue
				dataQueue = [];
			
			// Chooses a proper transport
			// the default one is streaming transport
			transportName = 
				stream.options.enableXDR && window.XDomainRequest ? "xdr" : 
				window.ActiveXObject ? "iframe" : 
				window.XMLHttpRequest ? "xhr" : null;
			transportName = 
				!stream.options.transport ?
					transportName :
					!$.isFunction(stream.options.transport) ? 
						stream.options.transport : 
						stream.options.transport(transportName, stream);
			
			transportFn = stream.options.transports && stream.options.transports[transportName] || transports[transportName];
			if (!transportFn) {
				return stream;
			}

			transport = transportFn(stream, $.extend(on, {
				// Called when a chunk has been received
				read: function(text) {
					if (stream.readyState === 0) {
						if (handleOpen(text, message, stream) === false) {
							return;
						}
						
						on.open();
					}
					
					for (;;) {
						if (handleMessage(text, message, stream) === false) {
							return;
						}
						
						on.message(message.data);
						
						// Resets the data
						message.data = "";
					}
				},
				// Called when a connection has been established
				open: function() {
					if (stream.readyState === 0) {
						stream.readyState = 1;
						trigger(stream, "open");
					}
				},
				// Called when a complete message has been received
				message: function(data) {
					if (stream.readyState === 1 || stream.readyState === 2) {
						// Pseudo MessageEvent
						trigger(stream, "message", {
							// Converts the data type
							data: stream.options.converters[stream.options.dataType](data), 
							origin: "", 
							lastEventId: "", 
							source: null, 
							ports: null
						});
					}
				},
				// Called when a connection has been closed
				close: function() {
					if (stream.readyState < 3) {
						stream.readyState = 3;
						
						// Pseudo CloseEvent
						trigger(stream, "close", {
							// Presumes that the stream closed cleanly
							wasClean: true, 
							code: null, 
							reason: ""
						});
						
						// Reconnect?
						if (stream.options.reconnect) {
							$.stream(url, options);
						}
					}
				},
				// Called when a connection has been closed due to an error
				error: function() {
					var readyState = stream.readyState;
					if (readyState < 3) {
						stream.readyState = 3;
						
						// Prevents reconnecting
						stream.options.reconnect = false;
						
						// If establishing a connection fails, fires the close event instead of the error event 
						if (readyState === 0) {
							// Pseudo CloseEvent
							trigger(stream, "close", {
								wasClean: false, 
								code: null, 
								reason: ""
							});
						} else {
							trigger(stream, "error");
						}
					}
				}
			}), message);
			
			// Default response handler
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
			};
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
			};
			
			// Default request handler
			handleSend = stream.options.handleSend || function(type, options, stream) {
				options.headers = {
					"x-jquery-stream-id": stream.id || "undefined",
					"x-jquery-stream-type": type
				};
			};
			
			// Overrides send and close
			$.extend(stream, {
				send: function(data) {
					if (stream.readyState === 0) {
						$.error("INVALID_STATE_ERR: Stream not open");
					}
					
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
					// Do nothing if the readyState is in the CLOSING or CLOSED
					if (stream.readyState < 2) {
						stream.readyState = 2;
						
						var options = {url: stream.url, type: "POST"};
						
						if (handleSend("close", options, stream) !== false) {
							// Notifies the server
							$.ajax(options);
						}

						// Prevents reconnecting
						stream.options.reconnect = false;
						transport.close();
					}
				}
			});

			// Deals with the throbber of doom
			if (!throbber) {
				transport.open();
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
								setTimeout(reconnect, 10);
							});
						} else {
							reconnect();
						}
						
						function reconnect() {
							stream.options.close.push(function() {
								setTimeout(function() {
									$.stream(url, options);
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
		}
		
	});
	
	$.extend(transports, {

		// XMLHttpRequest: Modern browsers except Internet Explorer
		xhr: function(stream, on, message) {
			var stop,
				polling, 
				preStatus, 
				xhr = new window.XMLHttpRequest();
			
			xhr.onreadystatechange = function() {
				switch (xhr.readyState) {
				// Handles open and message event
				case 3:
					if (xhr.status !== 200) {
						return;
					}
					
					on.read(xhr.responseText);
					
					// For Opera
					if ($.browser.opera && !polling) {
						polling = true;
						
						stop = iterate(function() {
							if (xhr.readyState === 4) {
								return false;
							}
							
							if (xhr.responseText.length > message.index) {
								on.read(xhr.responseText);
							}
						}, stream.options.operaInterval);
					}
					break;
				// Handles error or close event
				case 4:
					// HTTP status 0 could mean that the request is terminated by abort method
					// but it's not error in Stream object
					on[xhr.status !== 200 && preStatus !== 200 ? "error" : "close"]();
					break;
				}
			};
			
			return {
				open: function() {
					xhr.open("GET", prepareURL(stream.url, stream.options.openData));
					xhr.send();
				},
				close: function() {
					if (stop) {
						stop();
					}
					
					// Saves status
					try {
						preStatus = xhr.status;
					} catch (e) {}
					xhr.abort();
				}
			};
		},

		// Hidden iframe: Internet Explorer
		iframe: function(stream, on, message) {
			var stop,
				doc = new window.ActiveXObject("htmlfile");
			
			doc.open();
			doc.close();
			
			return {
				open: function() {
					var iframe = doc.createElement("iframe");
					iframe.src = prepareURL(stream.url, stream.options.openData);
					
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
								on.error();
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
						on.read(readResponse());
						
						// Handles message and close event
						stop = iterate(function() {
							var text = readResponse();
							if (text.length > message.index) {
								on.read(text);
								
								// Empties response every time that it is handled
								response.innerText = "";
								message.index = 0;
							}

							if (cdoc.readyState === "complete") {
								on.close();
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
					on.close();
				}
			};
		},

		// XDomainRequest: Optionally Internet Explorer 8+
		xdr: function(stream, on) {
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
				on.read(xdr.responseText);
			};
			// Handles error event
			xdr.onerror = on.error;
			// Handles close event
			xdr.onload = on.close;
			
			return {
				open: function() {
					xdr.open("GET", prepareURL(rewriteURL(stream.url), stream.options.openData));
					xdr.send();
				},
				close: function() {
					xdr.abort();
					on.close();
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
	
	function trigger(stream, event, props) {
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
	
	function prepareURL(url, data) {
		// Converts data into a query string
		if (data && typeof data !== "string") {
			data = param(data);
		}
		
		// Attaches a time stamp to prevent caching
		var ts = $.now(),
			ret = url.replace(/([?&])_=[^&]*/, "$1_=" + ts);

		return ret + (ret === url ? (/\?/.test(url) ? "&" : "?") + "_=" + ts : "") + (data ? ("&" + data) : "");
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
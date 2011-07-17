(function() {
	var script = "";
	$.ajax("../jquery.stream.js", {async: false})
	.success(function(data) {
		script = data;
	});
	
	this.teardown = function() {
		$(window).trigger("unload.stream");
		$.globalEval(script);
	};
})();

module("jQuery.stream", {
	setup: function() {
		$.stream.setup({
			enableXDR: true
		});
	},
	teardown: teardown
});

test("Finding the first stream object", function() {
	ok($.stream("stream", {}) == $.stream());
	ok($.stream("stream?second", {}) != $.stream());
});

test("Finding a stream object by url", function() {
	ok($.stream("stream", {}) == $.stream("stream"));
});

test("Finding a stream object by alias", function() {
	ok($.stream("stream", {alias: "s"}) == $.stream("s"));
});

asyncTest("Setting defaut options", function() {
	$.stream.setup({
		context: $("#undertow")
	});
	
	$.stream("stream", {
		open: function() {
			ok(true);
			equal(this.attr("id"), "undertow");
			start();
		}
	});
});

asyncTest("Global stream event handlers", 6, function() {
	var url = "stream?message=true&close=true";
	
	$("#undertow")
	.streamOpen(function(e, event, stream) {
		if (stream.url === url) {
			ok(true);
		}
	})
	.streamMessage(function(e, event, stream) {
		if (stream.url === url) {
			equal(event.data, "data");
		}
	})
	.streamClose(function(e, event, stream) {
		if (stream.url === url) {
			ok(true);
			start();
		}
	});
	
	$.stream(url, {
		reconnect: false,
		open: function() {
			ok(true);
		},
		message: function(event, stream) {
			equal(event.data, "data");
		},
		close: function() {
			ok(true);
		}
	});
});

asyncTest("Only local stream event handlers", 3, function() {
	var url = "stream?message=true&close=true";
	
	$("#undertow")
	.streamOpen(function(e, event, stream) {
		if (stream.url === url) {
			ok(false);
		}
	})
	.streamMessage(function(e, event, stream) {
		if (stream.url === url) {
			ok(false);
		}
	})
	.streamClose(function(e, event, stream) {
		if (stream.url === url) {
			ok(false);
		}
	});
	
	$.stream(url, {
		reconnect: false,
		global: false,
		open: function() {
			ok(true);
		},
		message: function(event, stream) {
			equal(event.data, "data");
		},
		close: function() {
			ok(true);
			start();
		}
	});
});

$.each({http: "HTTP Streaming", ws: "WebSocket"}, function(type, moduleName) {
	
	if (type === "ws" && !window.WebSocket) {
		return;
	}
	
	module(moduleName, {
		setup: function() {
			$.stream.setup({
				type: type,
				enableXDR: true
			});
		}, 
		teardown: teardown
	});
	
	asyncTest("Open event", function() {
		$.stream("stream", {
			open: function(event, stream) {
				ok(true);
				equal(event.type, "open");
				ok(stream == $.stream());
				equal(stream.readyState, 1);
				start();
			}
		});
	});

	asyncTest("Multiple event handlers", function() {
		var text = "";
		
		$.stream("stream", {
			open: [
				function() {
					text += "A";
				},
				function() {
					text += "B";
				},
				function() {
					text += "C";
					equal(text, "ABC");
				},
				start
			]
		});
	});

	asyncTest("Events with context", function() {
		var ts = new Date().getTime();
		
		$.stream("stream", {
			context: {ts: ts},
			open: function(event, stream) {
				equal(this.ts, ts);
				start();
			}
		});
	});

	asyncTest("Message event", function() {
		$.stream("stream?message=true", {
			message: function(event, stream) {
				ok(event.data);
				equal(event.data, "data");
				start();
			}
		});
	});

	asyncTest("Message event with text data", function() {
		$.stream("stream?message=true&dataType=text", {
			dataType: "text",
			message: function(event, stream) {
				ok(event.data);
				equal(typeof event.data, "string");
				equal(event.data, "data");
				start();
			}
		});
	});

	asyncTest("Message event with json data", function() {
		$.stream("stream?message=true&dataType=json", {
			dataType: "json",
			message: function(event, stream) {
				ok(event.data);
				ok($.isPlainObject(event.data));
				equal(event.data.data, "data");
				start();
			}
		});
	});

	asyncTest("Message event with xml data", function() {
		$.stream("stream?message=true&dataType=xml", {
			dataType: "xml",
			message: function(event, stream) {
				ok(event.data);
				ok($.isXMLDoc(event.data));
				equal($("data", event.data).text(), "data");
				start();
			}
		});
	});

	asyncTest("Message event with custom data type", function() {
		$.stream("stream?message=true&dataType=csv", {
			dataType: "csv",
			converters: {
				csv: function(data) {
					return data.split(",");
				}
			},
			message: function(event, stream) {
				ok(event.data);
				ok($.isArray(event.data));
				equal(event.data[0], "data1");
				start();
			}
		});
	});

	asyncTest("Error event", function() {
		$.stream("stream?error=true", {
			error: function(event, stream) {
				ok(true);
				equal(stream.readyState, 3);
				start();
			},
			close: function(event, stream) {
				ok(true);
				equal(stream.readyState, 3);
				start();
			}
		});
	});

	asyncTest("Close event", function() {
		$.stream("stream?close=true", {
			reconnect: false,
			close: function(event, stream) {
				ok(true);
				equal(stream.readyState, 3);
				start();
			}
		});
	});
	
	asyncTest("Stream.close()", function() {
		$.stream("stream", {
			open: function(event, stream) {
				ok(true);
				stream.close();
			},
			close: function() {
				ok(true);
				start();
			}
		});
	});

	asyncTest("Reconnection", 2, function() {
		var i = 0;
		$.stream("stream?close=true", {
			open: function(event, stream) {
				i++;
				ok(true);
				
				if (i > 1) {
					stream.close();
					start();
				}
			}
		});
	});

	asyncTest("Stream.send() - query string data",  function() {
		$.stream("stream", {
			open: function(event, stream) {
				stream.send("message=" + encodeURIComponent("Hollow Jan"));
			},
			message: function(event) {
				equal(event.data, "Hollow Jan");
				start();
			}
		});
	});

	asyncTest("Stream.send() - object data",  function() {
		$.stream("stream", {
			open: function(event, stream) {
				stream.send({message: "Hollow Jan"});
			},
			message: function(event) {
				equal(event.data, "Hollow Jan");
				start();
			}
		});
	});

	asyncTest("openData - string data",  function() {
		$.stream("stream", {
			openData: "message=true&dataType=json",
			dataType: "json",
			message: function(event) {
				equal(event.data.data, "data");
				start();
			}
		});
	});
	
	asyncTest("openData - object data",  function() {
		$.stream("stream", {
			openData: {
				message: true,
				dataType: function() {
					return "json";
				}
			},
			dataType: "json",
			message: function(event) {
				equal(event.data.data, "data");
				start();
			}
		});
	});
	
	if (type === "ws") {
		asyncTest("Subprotocol", function() {
			var protocol = "test";
			
			$.stream("stream", {
				protocols: protocol,
				message: function(event, stream) {
					equal(event.data, protocol);
					start();
				}
			});
		});
	}
	
	if (type === "http") {
		asyncTest("Rewriting URL for XDomainRequest", function() {
			$.stream("stream?message=true", {
				rewriteURL: function(url) {
					ok(!!window.XDomainRequest);
					return url + "&dataType=json";
				},
				message: function(event) {
					equal(event.data, window.XDomainRequest ? "{\"data\":\"data\"}" : "data");
					start();
				}
			});
		});
		
		asyncTest("handleOpen", 3, function() {
			$.stream.setup({
				handleOpen: function(text, message, stream) {
					stream.id = text.substring(0, text.indexOf("\r\n"));
					message.index = text.indexOf("\r\n", stream.id.length + "\r\n".length) + "\r\n".length;
					
					if (text.indexOf("OPEN", message.index) < 0) {
						ok(true);
						return false;
					}
					
					ok(true);
				}
			});
			
			$.stream("stream", {
				openData: {differentFormat: true, delayOpen: true},
				open: function(event, stream) {
					ok(true);
					start();
				}
			});
		});
		
		asyncTest("handleMessage", function() {
			$.stream.setup({
				handleOpen: function(text, message, stream) {
					stream.id = text.substring(0, text.indexOf("\r\n"));
					message.index = text.indexOf("\r\n", stream.id.length + "\r\n".length) + "\r\n".length;
				},
				handleMessage: function(text, message, stream) {
					var end = text.indexOf("\r\n", message.index);
					if (end < 0) {
						return false;
					}
					
					message.data = $.trim(text.substring(message.index, end));
					message.index = end + "\r\n".length;
				}
			});
			
			$.stream("stream", {
				openData: {differentFormat: true, dataType: "json", message: true},
				dataType: "json",
				message: function(event, stream) {
					equal(event.data.data, "data");
					start();
				}
			});
		});
		
		asyncTest("handleSend", 4, function() {
			var echo = "";

			$.stream.setup({
				handleOpen: function(text, message, stream) {
					stream.id = text.substring(0, text.indexOf(";"));
					message.index = text.indexOf(";", stream.id.length + 1) + 1;
				},
				handleSend: function(type, options, stream) {
					switch (type) {
					case "close":
						options.data = {"metadata.type": type, "metadata.id": stream.id};
						break;
					default:
						if (options.data.message % 2) {
							return false;
						}
					
						$.extend(true, options, {
							data: {"metadata.type": type, "metadata.id": stream.id},
							success: function() {
								ok(true);
							}
						});
						break;
					}
				}
			});
			
			$.stream("stream", {
				dataType: "json",
				open: function(event, stream) {
					for (var i = 0; i < 5; i++) {
						stream.send({message: i});
					}
				},
				message: function(event, stream) {
					echo += event.data;
					if (echo.length === 3) {
						equal(echo, "024");						
						start();
					}
				}
			});
		});
	}
	
});
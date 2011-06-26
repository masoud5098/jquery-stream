(function() {
	var originalOptions = $.extend(true, {}, $.stream.options);

	this.teardown = function() {
		var stream = $.stream();
		if (stream) {
			var Stream = stream.constructor;
			for (var url in Stream.instances) {
				stream = Stream.instances[url];
				stream.options.global = false;
				
				if (stream.readyState) {
					stream.close();
				} else {
					stream.options.open.push(function() {
						stream.close();
					});
				}
				
				delete Stream.instances[url];
			}
		}
		
		$.stream.setup(originalOptions);
	};
})();

module("jQuery.stream", {teardown: teardown});

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
	$("#undertow")
	.streamOpen(function(e, event, stream) {
		ok(true);
	})
	.streamMessage(function(e, event, stream) {
		equal(event.data, "data");
	})
	.streamClose(function(e, event, stream) {
		ok(true);
		start();
	});
	
	$.stream("stream?message=true&close=true", {
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
	$("#undertow")
	.streamOpen(function(e, event, stream) {
		ok(false);
	})
	.streamMessage(function(e, event, stream) {
		ok(false);
	})
	.streamClose(function(e, event, stream) {
		ok(false);
	});
	
	$.stream("stream?message=true&close=true", {
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
			$.stream.setup({type: type});
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
	
});
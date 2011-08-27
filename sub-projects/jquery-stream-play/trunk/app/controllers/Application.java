package controllers;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

import play.data.parsing.UrlEncodedParser;
import play.libs.Codec;
import play.libs.F.Either;
import play.libs.F.EventStream;
import play.libs.F.Matcher;
import play.libs.F.Promise;
import play.mvc.Controller;
import play.mvc.Http.WebSocketClose;
import play.mvc.Http.WebSocketEvent;
import play.mvc.WebSocketController;

import com.google.gson.Gson;

public class Application extends Controller {

	final static EventStream<String> eventStream = new EventStream<String>();

	public static void index() {
		render();
	}

	public static void open() {
		// Content-Type header
		response.contentType = "text/plain";

		// Access-Control-Allow-Origin header
		response.accessControl("*");

		response.writeChunk(
			// Id
			Codec.UUID() + ";" +
			// Padding
			Arrays.toString(new float[200]).replaceAll(".", " ") + ";");

		while (true) {
			try {
				// Waits until a message arrives
				String message = await(eventStream.nextEvent());

				// default message format is message-size ; message-data ;
				response.writeChunk(message.length() + ";" + message + ";");
			} catch (Exception e) {
				break;
			}
		}
	}
	
	public static void handle(Map<String, String> metadata, String username, String message) {
		if ("close".equals(metadata.get("type"))) {
			return;
		}

		// send-request
		doHandle(username, message);
	}

	public static class WebSocket extends WebSocketController {

		public static void open() {
			while (inbound.isOpen()) {
				Either<WebSocketEvent, String> either = await(Promise.waitEither(
						inbound.nextEvent(), eventStream.nextEvent()));

				// EventStream
				for (String message : Matcher.ClassOf(String.class).match(either._2)) {
					outbound.send(message);
				}

				// WebSocketEvent - message
				for (String message : WebSocketEvent.TextFrame.match(either._1)) {
					// Parses query string
					Map<String, String[]> params = UrlEncodedParser.parse(message);

					doHandle(params.get("username")[0], params.get("message")[0]);
				}

				// WebSocketEvent - close
				for (WebSocketClose closed : WebSocketEvent.SocketClosed.match(either._1)) {
					disconnect();
				}
			}
		}

	}

	// Request handler
	static void doHandle(String username, String message) {
		Map<String, String> data = new LinkedHashMap<String, String>();
		data.put("username", username);
		data.put("message", message);

		eventStream.publish(new Gson().toJson(data));
	}

}
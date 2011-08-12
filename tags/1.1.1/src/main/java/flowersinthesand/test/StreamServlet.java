package flowersinthesand.test;

import java.io.IOException;
import java.io.PrintWriter;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import javax.servlet.AsyncContext;
import javax.servlet.AsyncEvent;
import javax.servlet.AsyncListener;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.eclipse.jetty.util.UrlEncoded;
import org.eclipse.jetty.websocket.WebSocket;
import org.eclipse.jetty.websocket.WebSocketServlet;

public class StreamServlet extends WebSocketServlet {

	private static final long serialVersionUID = -7525476704378017593L;

	@Override
	protected void service(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		if (Boolean.valueOf(request.getParameter("error"))) {
			response.sendError(HttpServletResponse.SC_BAD_REQUEST);
		} else {
			super.service(request, response);
		}
	}

	private Map<String, AsyncContext> asyncContexts = new ConcurrentHashMap<String, AsyncContext>();

	@Override
	protected void doGet(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {

		response.setCharacterEncoding("utf-8");
		response.setContentType("text/plain");
		response.setHeader("Access-Control-Allow-Origin", "*");

		PrintWriter writer = response.getWriter();

		final String id = UUID.randomUUID().toString();
		writer.print(id);
		writer.print(';');

		for (int i = 0; i < 1024; i++) {
			writer.print(' ');
		}
		writer.print(';');
		writer.flush();

		final AsyncContext ac = request.startAsync();
		ac.addListener(new AsyncListener() {
			public void onComplete(AsyncEvent event) throws IOException {
				asyncContexts.remove(id);
			}

			public void onTimeout(AsyncEvent event) throws IOException {
				asyncContexts.remove(id);
			}

			public void onError(AsyncEvent event) throws IOException {
				asyncContexts.remove(id);
			}

			public void onStartAsync(AsyncEvent event) throws IOException {

			}
		});
		asyncContexts.put(id, ac);

		if (Boolean.valueOf(request.getParameter("message"))) {
			sendMessage(writer, createMessage(request.getParameter("dataType")));
		}
		if (Boolean.valueOf(request.getParameter("close"))) {
			ac.setTimeout(150);
		}
	}

	@Override
	protected void doPost(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		request.setCharacterEncoding("utf-8");

		AsyncContext ac = asyncContexts.get(request.getParameter("metadata.id"));
		if (ac == null) {
			return;
		}

		if ("close".equals(request.getParameter("metadata.type"))) {
			ac.complete();
			return;
		}

		sendMessage(ac.getResponse().getWriter(), request.getParameter("message"));
	}

	private void sendMessage(PrintWriter writer, String message) {
		writer.print(message.length() + ";" + message + ";");
		writer.flush();
	}

	@Override
	public WebSocket doWebSocketConnect(final HttpServletRequest request, String protocol) {
		return new WebSocket.OnTextMessage() {

			Connection connection;

			@Override
			public void onOpen(Connection connection) {
				this.connection = connection;
				if (Boolean.valueOf(request.getParameter("message"))) {
					try {
						connection.sendMessage(createMessage(request.getParameter("dataType")));
					} catch (IOException e) {
						throw new RuntimeException(e);
					}
				}
				if (connection.getProtocol() != null) {
					try {
						connection.sendMessage(connection.getProtocol());
					} catch (IOException e) {
						throw new RuntimeException(e);
					}
				}
				if (Boolean.valueOf(request.getParameter("close"))) {
					connection.disconnect();
				}
			}

			@Override
			public void onClose(int closeCode, String message) {

			}

			@Override
			public void onMessage(String data) {
				UrlEncoded parameters = new UrlEncoded(data);
				try {
					connection.sendMessage(parameters.getString("message"));
				} catch (IOException e) {
					throw new RuntimeException(e);
				}
			}

		};
	}

	private String createMessage(String dataType) {
		if ("text".equals(dataType)) {
			return "data";
		} else if ("json".equals(dataType)) {
			return "{\"data\":\"data\"}";
		} else if ("xml".equals(dataType)) {
			return "<data>data</data>";
		} else if ("csv".equals(dataType)) {
			return "data1,data2,data3";
		} else {
			return "data";
		}
	}

}
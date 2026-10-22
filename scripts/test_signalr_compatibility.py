"""Wire-format compatibility for our SignalR dependency maintenance fork."""
import unittest

import msgpack
from signalrcore.protocol.messagepack_protocol import MessagePackHubProtocol
from signalrcore.messages.invocation_message import InvocationMessage
from signalrcore.messages.ping_message import PingMessage


def frame(value):
    payload = msgpack.packb(value)
    length = len(payload)
    prefix = bytearray()
    while length >= 128:
        prefix.append((length & 127) | 128)
        length >>= 7
    prefix.append(length)
    return bytes(prefix) + payload


class SignalRCompatibilityTests(unittest.TestCase):
    def setUp(self):
        self.protocol = MessagePackHubProtocol()

    def test_known_ping_wire_bytes(self):
        self.assertEqual(self.protocol.encode(PingMessage()), b'\x02\x91\x06')
        self.assertEqual(self.protocol.parse_messages(b'\x02\x91\x06')[0].type.value, 6)

    def test_invocation_decoding_preserves_timing_payloads_and_multibyte_lengths(self):
        args = [{"driver": "VER", "lap": 51, "time": 84.123, "valid": True,
                 "note": "météo 🏎️ " * 50, "missing": None, "data": b'\x00\xff'}]
        decoded = self.protocol.parse_messages(frame([1, {}, '123', 'feed', args, []]))[0]
        self.assertEqual((decoded.invocation_id, decoded.target, decoded.arguments), ('123', 'feed', args))
        encoded = self.protocol.encode(InvocationMessage('123', 'feed', args))
        # The optional empty stream-id array is omitted by the upstream encoder.
        self.assertEqual(encoded, frame([1, {}, '123', 'feed', args]))

    def test_multiple_frames_and_completion(self):
        messages = self.protocol.parse_messages(frame([6]) + frame([3, {}, '123', 3, {"laps": [1, 2]}]))
        self.assertEqual(len(messages), 2)
        self.assertEqual(messages[1].result, {"laps": [1, 2]})

    def test_handshake_followed_by_binary_message(self):
        handshake, messages = self.protocol.decode_handshake(b'{}\x1e' + frame([6]))
        self.assertIsNone(handshake.error)
        self.assertEqual(messages[0].type.value, 6)

    def test_stream_cancel_close_and_ack(self):
        values = [[2, {}, '123', {"lap": 5}], [5, {}, '123'], [7, 'finished', True], [8, 42]]
        messages = self.protocol.parse_messages(b''.join(map(frame, values)))
        self.assertEqual([message.type.value for message in messages], [2, 5, 7, 8])
        self.assertEqual(messages[0].item, {"lap": 5})
        self.assertEqual(messages[2].error, 'finished')


if __name__ == '__main__':
    unittest.main()

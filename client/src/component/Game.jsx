import {
  Card,
  CardContent,
  List,
  Stack,
  Typography,
  TextField,
  Paper,
  Button,
} from "@mui/material";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import CustomDialog from "./customDialog";
import socket from "../socket";

function Game({ players, room, orientation, cleanup }) {
  const chess = useMemo(() => new Chess(), []); // <- 1
  const [fen, setFen] = useState(chess.fen()); // <- 2
  const [over, setOver] = useState("");

  const userVideo = useRef();
  const partnerVideo = useRef();
  const peerRef = useRef();
  const socketRef = useRef(socket);
  const otherUser = useRef();
  const userStream = useRef();
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: true })
      .then((stream) => {
        userVideo.current.srcObject = stream;
        userStream.current = stream;
        if (players.length > 1) {
          otherUser.current = players.find(
            (p) => p.id !== socketRef.current.id
          ).id;
          callUser(otherUser.current);
        }

        socketRef.current.on("offer", handleRecieveCall);

        socketRef.current.on("answer", handleAnswer);

        socketRef.current.on("ice-candidate", handleNewICECandidateMsg);
      });
  }, []);

  function callUser(userID) {
    peerRef.current = createPeer(userID);
    userStream.current
      .getTracks()
      .forEach((track) => peerRef.current.addTrack(track, userStream.current));
  }

  function createPeer(userID) {
    const peer = new RTCPeerConnection({
      iceServers: [
        {
          urls: "stun:stun.stunprotocol.org",
        },
        {
          urls: "turn:numb.viagenie.ca",
          credential: "muazkh",
          username: "webrtc@live.com",
        },
      ],
    });

    peer.onicecandidate = handleICECandidateEvent;
    peer.ontrack = handleTrackEvent;
    peer.onnegotiationneeded = () => handleNegotiationNeededEvent(userID);

    return peer;
  }

  function handleNegotiationNeededEvent(userID) {
    peerRef.current
      .createOffer()
      .then((offer) => {
        return peerRef.current.setLocalDescription(offer);
      })
      .then(() => {
        const payload = {
          target: userID,
          caller: socketRef.current.id,
          sdp: peerRef.current.localDescription,
        };
        socketRef.current.emit("offer", payload);
      })
      .catch((e) => console.log(e));
  }

  function handleRecieveCall(incoming) {
    peerRef.current = createPeer();
    const desc = new RTCSessionDescription(incoming.sdp);
    peerRef.current
      .setRemoteDescription(desc)
      .then(() => {
        userStream.current
          .getTracks()
          .forEach((track) =>
            peerRef.current.addTrack(track, userStream.current)
          );
      })
      .then(() => {
        return peerRef.current.createAnswer();
      })
      .then((answer) => {
        return peerRef.current.setLocalDescription(answer);
      })
      .then(() => {
        const payload = {
          target: incoming.caller,
          caller: socketRef.current.id,
          sdp: peerRef.current.localDescription,
        };
        socketRef.current.emit("answer", payload);
      });
  }

  function handleAnswer(message) {
    const desc = new RTCSessionDescription(message.sdp);
    peerRef.current.setRemoteDescription(desc).catch((e) => console.log(e));
  }

  function handleICECandidateEvent(e) {
    if (e.candidate) {
      const payload = {
        target: otherUser.current,
        candidate: e.candidate,
      };
      socketRef.current.emit("ice-candidate", payload);
    }
  }

  function handleNewICECandidateMsg(incoming) {
    const candidate = new RTCIceCandidate(incoming);

    peerRef.current.addIceCandidate(candidate).catch((e) => console.log(e));
  }

  function handleTrackEvent(e) {
    partnerVideo.current.srcObject = e.streams[0];
  }
  useEffect(() => {
    socket.on("playerDisconnected", (player) => {
      setOver(`${player.username} has disconnected`); // set game over
    });
  }, []);
  useEffect(() => {
    socket.on("closeRoom", ({ roomId }) => {
      if (roomId === room) {
        cleanup();
      }
    });
  }, [room, cleanup]);
  const makeAMove = useCallback(
    (move) => {
      try {
        const result = chess.move(move); // update Chess instance
        setFen(chess.fen()); // update fen state to trigger a re-render

        console.log("over, checkmate", chess.isGameOver(), chess.isCheckmate());

        if (chess.isGameOver()) {
          // check if move led to "game over"
          if (chess.isCheckmate()) {
            // if reason for game over is a checkmate
            // Set message to checkmate.
            setOver(
              `Checkmate! ${chess.turn() === "w" ? "black" : "white"} wins!`
            );
            // The winner is determined by checking for which side made the last move
          } else if (chess.isDraw()) {
            // if it is a draw
            setOver("Draw"); // set message to "Draw"
          } else {
            setOver("Game over");
          }
        }

        return result;
      } catch (e) {
        return null;
      } // null if the move was illegal, the move object if the move was legal
    },
    [chess]
  );

  // onDrop function
  function onDrop(sourceSquare, targetSquare) {
    // orientation is either 'white' or 'black'. game.turn() returns 'w' or 'b'
    if (chess.turn() !== orientation[0]) return false; // <- 1 prohibit player from moving piece of other player

    if (players.length < 2) return false; // <- 2 disallow a move if the opponent has not joined

    const moveData = {
      from: sourceSquare,
      to: targetSquare,
      color: chess.turn(),
      promotion: "q", // promote to queen where possible
    };

    const move = makeAMove(moveData);

    // illegal move
    if (move === null) return false;

    socket.emit("move", {
      // <- 3 emit a move event.
      move,
      room,
    }); // this event will be transmitted to the opponent via the server

    return true;
  }
  const [message, setMessage] = useState(""); // <- 1
  const [messageList, setMessageList] = useState([]); // <- 1

  useEffect(() => {
    socket.on("message_send", (msg) => {
      // console.log(msg);
      console.log(messageList);
      setMessageList((prev) => {
        return [...prev, { content: msg.message, id: otherUser.current }];
      });
    });
  }, []);

  useEffect(() => {
    setMessage("");
  }, [messageList]);
  useEffect(() => {
    socket.on("move", (move) => {
      makeAMove(move); //
    });
  }, [makeAMove]);
  // Game component returned jsx

  return (
    <Stack>
      <Card>
        <CardContent>
          <Typography variant="h5">Room ID: {room}</Typography>
        </CardContent>
      </Card>
      <Stack flexDirection="row" sx={{ pt: 2 }}>
        <div
          className="board"
          style={{
            maxWidth: 600,
            maxHeight: 600,
            flexGrow: 1,
          }}
        >
          <Chessboard
            position={fen}
            onPieceDrop={onDrop}
            boardOrientation={orientation}
          />
        </div>

        <Stack flexDirection={"column"}>
          <Stack flexDirection={"row"} spacing={2}>
            <video
              autoPlay
              ref={userVideo}
              width={"200px"}
              style={{ margin: "2px", border: "1px solid black" }}
            />
            <video
              autoPlay
              ref={partnerVideo}
              width={"200px"}
              style={{ margin: "2px", border: "1px solid black" }}
            />
          </Stack>
          <div style={{ flexGrow: 1 }}>
            <Paper style={{ maxHeight: 200, overflow: "auto" }}>
              {messageList.map((msg, i) => {
                return (
                  <List
                    style={{
                      textAlign: msg.id === socket.id ? "right" : "left",
                      padding: "5px",
                    }}
                    key={i}
                  >
                    {msg.content}
                  </List>
                );
              })}
            </Paper>
          </div>
          <Stack flexDirection={"row"} sx={{ margin: 0, padding: 0 }}>
            <TextField
              id="outlined-basic"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              label="Enter the message"
              variant="outlined"
              sx={{ background: "white", width: "100%", marginLeft: "10px" }}
            />
            <Button
              onClick={() => {
                const obj = {
                  message,
                  room,
                };
                setMessageList([
                  ...messageList,
                  { content: message, id: socket.id },
                ]);
                // setMessage("");
                socket.emit("message", obj);
              }}
              sx={{
                padding: "15px",
                background: "lightblue",
                marginLeft: "5px",
              }}
            >
              Send
            </Button>
          </Stack>
        </Stack>
        {/* {players.length > 0 && (
          <Box
            sx={{
              width: "100%",
              border: "1px solid black",
              margin: "1px",
              background: "white",
            }}
          >
            <List>
              <ListSubheader
                sx={{
                  background: "white",
                  marginTop: "1px",
                  border: "1px solid black",
                }}
              >
                Players
              </ListSubheader>
              {players.map((p) => (
                <ListItem key={p.id}>
                  <ListItemText primary={p.username} />
                </ListItem>
              ))}
            </List>
          </Box>
        )} */}
      </Stack>
      <CustomDialog // Game Over CustomDialog
        open={Boolean(over)}
        title={over}
        contentText={over}
        handleContinue={() => {
          socket.emit("closeRoom", { roomId: room });
          cleanup();
        }}
      />
    </Stack>
  );
}

export default Game;

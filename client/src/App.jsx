import { useEffect, useState, useCallback } from "react";
import Container from "@mui/material/Container";
import Game from "./component/Game";
import InitGame from "./component/InitGame";
import CustomDialog from "./component/customDialog";
import socket from "./socket";
import { TextField } from "@mui/material";

export default function App() {
  const [username, setUsername] = useState("");
  const [usernameSubmitted, setUsernameSubmitted] = useState(false);

  const [room, setRoom] = useState("");
  const [orientation, setOrientation] = useState("");
  const [players, setPlayers] = useState([]);

  // resets the states responsible for initializing a game
  const cleanup = useCallback(() => {
    setRoom("");
    setOrientation("");
    setPlayers("");
  }, []);

  useEffect(() => {
    socket.on("opponentJoined", (roomData) => {
      console.log("roomData", roomData);
      // sync players state with the server as soon as the opponent joins
      setPlayers(roomData.players);
    });
  }, []);

  return (
    <div>
      <Container
        disableGutters={true}
        sx={{ background: "#ECFDDC", width: "100%" }}
      >
        <CustomDialog
          open={!usernameSubmitted}
          handleClose={() => setUsernameSubmitted(true)}
          title="Pick a username"
          contentText="Please select a username"
          handleContinue={() => {
            if (!username) return;
            socket.emit("username", username);
            setUsernameSubmitted(true);
          }}
        >
          <TextField
            autoFocus
            margin="dense"
            id="username"
            label="Username"
            name="username"
            value={username}
            required
            onChange={(e) => setUsername(e.target.value)}
            type="text"
            fullWidth
            variant="standard"
          />
        </CustomDialog>
        {room ? (
          <Game
            room={room}
            orientation={orientation}
            username={username}
            players={players}
            // the cleanup function will be used by Game to reset the state when a game is over
            cleanup={cleanup}
          />
        ) : (
          <InitGame
            setRoom={setRoom}
            setOrientation={setOrientation}
            setPlayers={setPlayers}
          />
        )}
      </Container>
    </div>
  );
}

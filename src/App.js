import { useEffect, useState } from "react";
import { ethers } from "ethers";
import VestingContractABI from "./abis/VestingABI.json";
import {
  Button,
  Typography,
  Box,
  Container,
  TextField,
  Stack,
  Paper,
  Chip,
  RadioGroup,
  FormControlLabel,
  Radio,
  Snackbar,
  Alert as MuiAlert,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import { Line } from "react-chartjs-2";
import {
  Chart,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

Chart.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const CONTRACT_ADDRESS = "0x3f14E401Cdbc82Dc26F6750384C1182333e09425";

const VestingInterface = () => {
  const [account, setAccount] = useState("");
  const [releasable, setReleasable] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [vestingType, setVestingType] = useState("vesting1"); // Default to Vesting Schedule 1
  const [vestingData, setVestingData] = useState({
    recipient: "",
    start: dayjs(), // Default to today’s date
    cliffDuration: "",
    period: "",
    customPercentPerRelease: "",
    amount: "",
  });
  const [isVestingSet, setIsVestingSet] = useState(false); // Track if vesting was set
  const [formError, setFormError] = useState(""); // Validation error handling
  const [snackbarOpen, setSnackbarOpen] = useState(false); // Snackbar visibility
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [snackbarSeverity, setSnackbarSeverity] = useState("success"); // "success" or "error"
  const [vestingChartData, setVestingChartData] = useState(null);

  useEffect(() => {
    const loadVestingInfo = async () => {
      if (account) {
        try {
          const provider = new ethers.BrowserProvider(window.ethereum);
          const contract = new ethers.Contract(
            CONTRACT_ADDRESS,
            VestingContractABI,
            provider
          );

          // Check if the connected account is the contract owner (admin)
          const owner = await contract.owner();
          setIsAdmin(owner.toLowerCase() === account.toLowerCase());

          const vestingDetails = await contract.viewAssets(account);
          const releasableTokens = ethers.toBigInt(vestingDetails[0]);
          const releaseTimes = vestingDetails[1].map((time) => Number(time));
          setReleasable(parseFloat(ethers.formatUnits(releasableTokens, 18))); // Adjust for token decimals

          // Load vesting data for recipient chart
          if (!isAdmin) {
            const percentages = releaseTimes.map((_, index) => {
              // Assuming percentages are evenly distributed based on the schedule
              return (100 / releaseTimes.length).toFixed(2);
            });
            setVestingChartData({ times: releaseTimes, percentages });
          }
        } catch (error) {
          console.error("Error loading vesting information:", error);
        }
      }
    };
    loadVestingInfo();
  }, [account]);

  const connectWallet = async () => {
    if (window.ethereum) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      setAccount(await signer.getAddress());
    } else {
      handleSnackbarOpen("MetaMask is not installed!", "error");
    }
  };

  const calculateVestingSchedule = () => {
    const { cliffDuration, period, start } = vestingData;
    let percents = [];

    if (vestingType === "vesting1") {
      percents = [25, 25, 25, 25]; // Vesting Schedule 1
    } else if (vestingType === "vesting2") {
      percents = [50, 50]; // Vesting Schedule 2
    } else if (vestingType === "custom") {
      percents = vestingData.customPercentPerRelease
        .split(",")
        .map((percent) => parseFloat(percent.trim())); // Custom Percentages
    }

    const cliffEnd = dayjs(start).add(parseInt(cliffDuration), "month").unix();
    const times = [];

    percents.forEach((_, index) => {
      const releaseTime = dayjs
        .unix(cliffEnd)
        .add(index * parseInt(period), "month")
        .unix();
      times.push(releaseTime);
    });

    return { times, percents };
  };

  const handleChange = (e) => {
    setVestingData({
      ...vestingData,
      [e.target.name]: e.target.value,
    });
  };

  const handleDateChange = (newDate) => {
    setVestingData({
      ...vestingData,
      start: newDate,
    });
  };

  const handleVestingTypeChange = (event) => {
    setVestingType(event.target.value);
  };

  const validateForm = () => {
    const { recipient, cliffDuration, period, amount } = vestingData;

    if (!recipient || !cliffDuration || !period || !amount) {
      handleSnackbarOpen("All fields are required.", "error");
      return false;
    }

    if (vestingType === "custom" && !vestingData.customPercentPerRelease) {
      handleSnackbarOpen("Custom percent per release is required.", "error");
      return false;
    }

    return true;
  };

  const handleSetVesting = async () => {
    if (!validateForm()) {
      return;
    }

    const { recipient, amount, start } = vestingData;
    const { times, percents } = calculateVestingSchedule();

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(
      CONTRACT_ADDRESS,
      VestingContractABI,
      signer
    );

    try {
      // Call setVesting from the contract
      await contract.setVesting(
        recipient,
        Number(dayjs(start).unix()), // Convert selected date to Unix timestamp
        times.map((time) => Number(time)),
        percents,
        ethers.parseUnits(amount, 18)
      );
      handleSnackbarOpen("Vesting schedule set successfully!", "success");
      setIsVestingSet(true); // Mark as successful
    } catch (error) {
      handleSnackbarOpen(
        "Error setting vesting schedule. Please try again.",
        "error"
      );
      console.error(error);
    }
  };

  // Handle stop payments function (admin only)
  const handleStopPayments = async () => {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(
      CONTRACT_ADDRESS,
      VestingContractABI,
      signer
    );

    try {
      await contract.stopPayments(vestingData.recipient); // Assuming recipient is the one you want to stop payments for
      handleSnackbarOpen("Payments stopped successfully!", "success");
    } catch (error) {
      handleSnackbarOpen("Error stopping payments. Please try again.", "error");
      console.error(error);
    }
  };

  const shortenAddress = (address) =>
    `${address.slice(0, 6)}...${address.slice(-4)}`;

  const handleSnackbarOpen = (message, severity) => {
    setSnackbarMessage(message);
    setSnackbarSeverity(severity);
    setSnackbarOpen(true);
  };

  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Container maxWidth="sm" sx={{ mt: 5 }}>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
          }}
        >
          <Button
            variant="contained"
            color="primary"
            onClick={connectWallet}
            sx={{ mb: 2 }}
          >
            Connect Wallet
          </Button>
          {account && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                backgroundColor: "#f5f5f5",
                padding: "10px",
                borderRadius: "8px",
              }}
            >
              <Typography variant="body1" color="textSecondary">
                Connected:
              </Typography>
              <Chip
                label={shortenAddress(account)}
                color="primary"
                sx={{ fontWeight: "bold" }}
              />
            </Box>
          )}
          {releasable > 0 && (
            <Typography variant="body1" color="textSecondary">
              Releasable Tokens: {releasable}
            </Typography>
          )}

          {isAdmin && (
            <>
              <Paper elevation={3} sx={{ p: 3, mb: 2, width: "100%" }}>
                <Typography variant="h6" gutterBottom>
                  Set Vesting Schedule
                </Typography>

                {!isVestingSet ? (
                  <Stack spacing={2}>
                    <TextField
                      label="Recipient Address"
                      name="recipient"
                      fullWidth
                      value={vestingData.recipient}
                      onChange={handleChange}
                      error={!vestingData.recipient && !!formError}
                      helperText={!vestingData.recipient && formError}
                    />
                    <DatePicker
                      label="Start Date"
                      value={vestingData.start}
                      onChange={handleDateChange}
                      renderInput={(params) => (
                        <TextField {...params} fullWidth />
                      )}
                    />
                    <TextField
                      label="Cliff Duration (Months)"
                      name="cliffDuration"
                      fullWidth
                      value={vestingData.cliffDuration}
                      onChange={handleChange}
                      error={!vestingData.cliffDuration && !!formError}
                      helperText={!vestingData.cliffDuration && formError}
                    />
                    <TextField
                      label="Release Period (Months)"
                      name="period"
                      fullWidth
                      value={vestingData.period}
                      onChange={handleChange}
                      error={!vestingData.period && !!formError}
                      helperText={!vestingData.period && formError}
                    />

                    {/* Radio buttons to choose between the three vesting schedules */}
                    <RadioGroup
                      value={vestingType}
                      onChange={handleVestingTypeChange}
                    >
                      <FormControlLabel
                        value="vesting1"
                        control={<Radio />}
                        label="Vesting Schedule 1 (25% per period)"
                      />
                      <FormControlLabel
                        value="vesting2"
                        control={<Radio />}
                        label="Vesting Schedule 2 (50% per period)"
                      />
                      <FormControlLabel
                        value="custom"
                        control={<Radio />}
                        label="Custom Vesting Schedule"
                      />
                    </RadioGroup>

                    {/* Display input for custom percentage if custom vesting is selected */}
                    {vestingType === "custom" && (
                      <TextField
                        label="Custom Percent Per Release (Comma Separated)"
                        name="customPercentPerRelease"
                        fullWidth
                        value={vestingData.customPercentPerRelease}
                        onChange={handleChange}
                        error={
                          !vestingData.customPercentPerRelease && !!formError
                        }
                        helperText={
                          !vestingData.customPercentPerRelease && formError
                        }
                      />
                    )}

                    <TextField
                      label="Amount to Vest"
                      name="amount"
                      fullWidth
                      value={vestingData.amount}
                      onChange={handleChange}
                      error={!vestingData.amount && !!formError}
                      helperText={!vestingData.amount && formError}
                    />
                    <Button
                      variant="contained"
                      color="primary"
                      fullWidth
                      onClick={handleSetVesting}
                    >
                      Set Vesting
                    </Button>
                    <Button
                      variant="contained"
                      color="error"
                      fullWidth
                      onClick={handleStopPayments}
                    >
                      Stop Payments
                    </Button>
                  </Stack>
                ) : (
                  <MuiAlert severity="success">
                    Vesting schedule set successfully!
                  </MuiAlert>
                )}
              </Paper>
            </>
          )}

          {/* Recipient View for Vesting Info */}
          {!isAdmin && (
            <Paper elevation={3} sx={{ p: 3, mb: 2, width: "100%" }}>
              <Typography variant="h6" gutterBottom>
                Recipient Vesting Info
              </Typography>
              <Stack spacing={2}>
                {vestingChartData && (
                  <Box>
                    <Line
                      data={{
                        labels: vestingChartData.times.map((time) =>
                          dayjs.unix(time).format("MMM DD, YYYY")
                        ),
                        datasets: [
                          {
                            label: "Vesting Percentages",
                            data: vestingChartData.percentages,
                            borderColor: "rgba(75, 192, 192, 1)",
                            backgroundColor: "rgba(75, 192, 192, 0.2)",
                          },
                        ],
                      }}
                      options={{
                        responsive: true,
                        plugins: {
                          legend: {
                            position: "top",
                          },
                          title: {
                            display: true,
                            text: "Vesting Schedule",
                          },
                        },
                      }}
                    />
                  </Box>
                )}
                <Typography variant="body1" color="textSecondary">
                  Releasable Tokens: {releasable}
                </Typography>
                <Button
                  variant="contained"
                  color="primary"
                  fullWidth
                  onClick={async () => {
                    const provider = new ethers.BrowserProvider(
                      window.ethereum
                    );
                    const signer = await provider.getSigner();
                    const contract = new ethers.Contract(
                      CONTRACT_ADDRESS,
                      VestingContractABI,
                      signer
                    );
                    try {
                      await contract.releaseTokens();
                      handleSnackbarOpen(
                        "Tokens released successfully!",
                        "success"
                      );
                    } catch (error) {
                      handleSnackbarOpen(
                        "Error releasing tokens. Please try again.",
                        "error"
                      );
                      console.error(error);
                    }
                  }}
                >
                  Release Tokens
                </Button>
              </Stack>
            </Paper>
          )}

          {/* Snackbar for success/error messages */}
          <Snackbar
            open={snackbarOpen}
            autoHideDuration={6000}
            onClose={handleSnackbarClose}
          >
            <MuiAlert
              onClose={handleSnackbarClose}
              severity={snackbarSeverity}
              sx={{ width: "100%" }}
            >
              {snackbarMessage}
            </MuiAlert>
          </Snackbar>
        </Box>
      </Container>
    </LocalizationProvider>
  );
};

export default VestingInterface;

package cmd

import (
	"fmt"

	"github.com/joho/godotenv"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"

	"phillipp.io/toggl-cli/internal/cmd/active"
	"phillipp.io/toggl-cli/internal/cmd/start"
	"phillipp.io/toggl-cli/internal/cmd/stop"
	"phillipp.io/toggl-cli/internal/cmd/times"
)

func NewCmdRoot() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "tgl <command> <subcommand> [flags]",
		Short: "Toggl Tack CLI",
		Long:  `Work with the Toggl Track API from the command line`,
	}

	_ = godotenv.Load()
	initViper()

	cmd.PersistentFlags().StringP("token", "t", "", "Toggl Track API token")

	cmd.AddCommand(times.NewCmdTimes())
	cmd.AddCommand(start.NewCmdStart())
	cmd.AddCommand(stop.NewCmdStop())
	cmd.AddCommand(active.NewCmdActive())

	cmd.SilenceUsage = true

	return cmd
}

func initViper() {
	// 		home, err := os.UserHomeDir()
	// 		cobra.CheckErr(err)

	viper.SetConfigFile(".tglcli")
	viper.SetConfigType("yml")

	viper.AddConfigPath(".")
	viper.AddConfigPath("$HOME")

	viper.AutomaticEnv()

	if err := viper.ReadInConfig(); err == nil {
		fmt.Println("Using config file:", viper.ConfigFileUsed())
		logLevel := viper.Get("logging.level")
		fmt.Printf("Log level: %v\n", logLevel)
	} else {
		fmt.Printf("Error reading config file: %v\n", err)
	}
}

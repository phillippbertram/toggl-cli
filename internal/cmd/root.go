package cmd

import (
	"github.com/joho/godotenv"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"

	"phillipp.io/toggl-cli/internal/cmd/active"
	"phillipp.io/toggl-cli/internal/cmd/entries"
	"phillipp.io/toggl-cli/internal/cmd/report"
	"phillipp.io/toggl-cli/internal/cmd/start"
	"phillipp.io/toggl-cli/internal/cmd/stop"
	"phillipp.io/toggl-cli/internal/config"
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

	cmd.AddCommand(report.NewCmdReport())
	cmd.AddCommand(start.NewCmdStart())
	cmd.AddCommand(stop.NewCmdStop())
	cmd.AddCommand(active.NewCmdActive())
	cmd.AddCommand(entries.NewCmdEntries())

	cmd.SilenceUsage = true

	return cmd
}

func initViper() {
	// 		home, err := os.UserHomeDir()
	// 		cobra.CheckErr(err)

	viper.SetConfigFile(".gotgl")
	viper.SetConfigType("yml")

	viper.AddConfigPath(".") // Search for config in the current directory
	viper.AddConfigPath("$HOME")
	viper.AutomaticEnv() // Read from environment variables

	config.LoadConfigWithViper()
}

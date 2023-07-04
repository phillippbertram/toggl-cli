package cmd

import (
	"fmt"

	"github.com/joho/godotenv"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"

	"phillipp.io/toggl-cli/internal/cmd/active"
	"phillipp.io/toggl-cli/internal/cmd/entries"
	"phillipp.io/toggl-cli/internal/cmd/report"
	"phillipp.io/toggl-cli/internal/cmd/start"
	"phillipp.io/toggl-cli/internal/cmd/stop"
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

type LoggingConfig struct {
	Level string `mapstructure:"level"`
}

type Config struct {
	Logging LoggingConfig `mapstructure:"logging"`
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
	} else {
		fmt.Printf("Error reading config file: %v\n", err)
	}

	var config Config
	if err := viper.Unmarshal(&config); err != nil {
		fmt.Printf("Error unmarshalling config: %v\n", err)
	} else {
		fmt.Printf("Config loaded: %+v\n", config)
	}
}

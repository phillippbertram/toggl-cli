package cmd

import (
	"log"
	"os"

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

	err := godotenv.Load()
	_ = godotenv.Load()

	initViper()

	cmd.PersistentFlags().StringP("token", "t", "", "Toggl Track API token")

	cmd.AddCommand(times.NewCmdTimes())
	cmd.AddCommand(start.NewCmdStart())
	cmd.AddCommand(stop.NewCmdStop())
	cmd.AddCommand(active.NewCmdActive())

	return cmd
}

func initViper() {
	// cobra.OnInitialize(initConfig)

	// setzt den erwarteten Pfad und Typ einer Config-Datei
	home, err := os.UserHomeDir()
	if err != nil {
		log.Printf("Error loading .env file: %v\n", err)
		log.Fatalf("Error getting user home directory: %v", err)
	}
	viper.AddConfigPath(".")
	viper.AddConfigPath(home)
	viper.SetConfigType("yaml")
	viper.SetConfigFile(".config")

}

// func initConfig() {
// 	if cfgFile != "" {
// 		// Use config file from the flag.
// 		viper.SetConfigFile(cfgFile)
// 	} else {
// 		// Find home directory.
// 		home, err := os.UserHomeDir()
// 		cobra.CheckErr(err)

// 		// Search config in home directory with name ".cobra" (without extension).
// 		viper.AddConfigPath(home)
// 		viper.SetConfigType("yaml")
// 		viper.SetConfigName(".cobra")
// 	}

// 	viper.AutomaticEnv()

// 	if err := viper.ReadInConfig(); err == nil {
// 		fmt.Println("Using config file:", viper.ConfigFileUsed())
// 	}
// }
